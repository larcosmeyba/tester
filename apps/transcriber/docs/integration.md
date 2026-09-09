# Wiring the import service into the Go server

The service produces a Recipe. It does not store one — it has no database, no
user table and no view of who is allowed to do what. The Go server keeps all of
that, which is why the boundary sits here.

## Who calls what

```
mobile app  ──GraphQL(JWT)──▶  Go API server  ──HTTP(shared secret)──▶  import service
                                     │                                       │
                                     │                                  yt-dlp + LLM
                                     ▼
                                  Postgres
```

The app never reaches the import service. The server resolves the viewer from
the verified JWT, exactly as every other meal field does, and passes the
resulting id down as `ownerUserId`.

## The GraphQL surface — already in the contract

This document originally proposed the schema to add. It is now history: the
canonical contract in `packages/api-contract/meals.graphql` went further than
this draft and is what both gqlgen and graphql-codegen generate from.

What shipped, and how it differs from the proposal below:

| Operation | Status |
| --- | --- |
| `importRecipeFromVideo(input:)` | Takes an input object, not a bare url |
| `recipeImport(importId:)` | As proposed |
| `recipeImports(limit:)` | Added — list your own imports |
| `cancelRecipeImport(importId:)` | Added |
| `acceptRecipeImport(importId:, input:)` | Added — saves the reviewed draft as a recipe |

`RecipeImportStatus` also carries `cancelled`, which this draft did not have.

Do not re-add any of it. The contract is the source of truth; this file
describes the service behind it.

Two things worth keeping consistent with the rest of the meal system:

- **No field takes a user id.** The viewer comes from the JWT.
- **An import the viewer does not own is `NOT_FOUND`, never `FORBIDDEN`.**
  Saying "that exists but is not yours" is itself a disclosure.

## Persisting the result

The service returns camelCase fields matching the `Recipe` type, so the mapping
into `UpsertRecipe` is field-for-field. Three values are the server's to set,
not the service's:

| Field | Why |
| --- | --- |
| `id` | The server mints recipe ids. |
| `ingredientId` on each line | Catalogue resolution needs the `ingredients` table. |
| `grams` on each line | Needs the catalogue's densities and unit weights. |

`ownerUserId` is the importing user, and `visibility`/`reviewStatus` arrive as
`private`/`draft` — the service refuses to emit anything else, but the service
layer should force them anyway rather than trusting its input.

### baseMealPlanEligible

The service computes this and is deliberately strict: false whenever
`missingInformation` is non-empty. It is a *recommendation*. The server stays
authoritative, and should recompute after ingredient resolution — a line the
service could not quantify may become quantifiable once matched to the
catalogue, and that only the server can know.

## A minimal client

```go
// internal/recipeimport/client.go
type Client struct {
	baseURL string
	secret  string
	http    *http.Client
}

type StartResponse struct {
	ImportID string `json:"importId"`
	Status   string `json:"status"`
}

func (c *Client) Start(ctx context.Context, url, ownerUserID string) (*StartResponse, error) {
	body, _ := json.Marshal(map[string]string{"url": url, "ownerUserId": ownerUserID})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/imports", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.secret)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return nil, decodeImportError(resp) // preserve the named code
	}

	var out StartResponse
	return &out, json.NewDecoder(resp.Body).Decode(&out)
}
```

Keep the service's error `code` intact all the way to the app. "That video is
private" and "we could not reach the transcription provider" need different
words in front of a user, and both are lost if they collapse into one failure.

## The job store, and what it costs

Jobs live in memory in a single process. That is honest about the load one
import puts on one container, and it has consequences:

- **A restart loses in-flight jobs.** A Cloud Run revision rollout will drop
  them, and a poll returns 404.
- **Two instances cannot see each other's jobs.** A poll routed to the wrong
  instance returns 404.

So run this with `--min-instances=1 --max-instances=1` until that matters. When
it does, the fix is to move `JobStore` behind Postgres or Redis — it is one
class with `submit`, `get` and a TTL sweep, and the interface does not change.

An alternative worth considering when imports become common: have the server
own a `recipe_imports` table and call `/v1/imports:sync` from a worker. Then
durability lives where all the other durability already is, and this service
goes back to being stateless.

## Ordering note

The mobile app's "paste a link" flow should treat a finished import as a
**draft to review**, not a saved recipe — the `missingInformation` list is
exactly the set of questions to put in front of the user, and that review is
what turns an unplannable import into a plannable recipe.
