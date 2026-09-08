# Penny — Architecture

Penny is Help The Hive's conversational assistant. She is a tool-using agent, not
a chatbot: almost every useful answer she gives is a fact she fetched through an
authenticated Help The Hive service, not a sentence she composed from memory.

This document is the design. It is written before the code so the boundaries are
argued once, in one place, rather than rediscovered per file.

## 1. The one rule

**The model never touches the database.**

Every read and every write goes through an authenticated Help The Hive backend
service. The agent process is deployed without database credentials, so this is
not a rule a reviewer must enforce — there is no connection for the model to
misuse. Its only egress is the LLM provider and the Help The Hive tool gateway.

Writes go through the real service functions, the same ones the app calls:

    generateMealPlan()   updatePantry()   createGroceryList()   saveResource()

## 2. Request path

    Penny Chat (Expo)
      | Authorization: Bearer <Better Auth JWT>
      v
    Help The Hive Backend (apps/server, Go)
      |- GraphQL   pennyConversations / pennyMessages       (history)
      |- SSE       GET /penny/stream                        (live turn)
      |- rate limit, persistence, audit log
      |- mints a short-lived per-turn tool token
      |     (user id, conversation id, allowed tool scopes, ~90s TTL)
      v
    Penny Agent / Router                       NO DATABASE CREDENTIALS
      |- route     intent -> toolset subset + persona pack
      |- recall    short-term window + user-scoped long-term memory
      |- retrieve  RAG over authoritative Help The Hive knowledge
      |- agent     LLM + structured tool calling
      |- act       tool calls -> back out to the gateway
      |- guard     output validation, disclaimers, refusals
      v
    LLM provider          Tool Gateway (Go, POST /penny/tools/{name})
    (abstraction)           |- verify token, check scope, validate schema
                            |- ownership check, confirmation gate
                            |- existing services -> Postgres

Two hops through the backend per turn is deliberate. The first hop authenticates
the human; the second authenticates the agent acting on that human's behalf, with
a narrower grant than the human's own token carries.

## 3. Folder structure

### The agent service

    apps/penny/
      pyproject.toml
      .env.example                 # no DATABASE_URL: by design, not by omission
      README.md
      penny/
        main.py                    # app factory, middleware, lifespan
        config.py                  # env -> Settings, fails fast at start-up
        api/
          deps.py                  # per-turn token verification, request context
          health.py                # /health, /health/detailed
          chat.py                  # POST /v1/penny/turn, .../turn/stream (SSE)
        graph/
          state.py                 # PennyState
          graph.py                 # node + edge wiring, readable end to end
          nodes/
            router.py              # intent -> toolset + persona pack
            recall.py              # memory into context
            retrieve.py            # RAG
            agent.py               # LLM + tool-calling loop
            act.py                 # dispatches tool calls to the gateway
            remember.py            # long-term memory writes
            guard.py               # output validation and disclaimers
        persona/
          penny.md                 # voice and tone. NO business logic.
          disclaimers.py           # required disclaimers, per topic
        policy/
          toolsets.py              # which tools each intent may even see
          safety.py                # refusal rules, forbidden claims
          redaction.py             # PII out of prompts, logs and traces
        tools/
          registry.py              # tool defs; read vs write; confirm required
          schemas.py               # Pydantic in/out per tool
          gateway.py               # HTTP client to the Go tool gateway
        memory/
          short_term.py            # thread window + summarization
          long_term.py             # user-scoped recall and upsert
        rag/
          retriever.py             # queries /penny/knowledge/search
          citations.py
        providers/
          base.py                  # Protocol: complete / stream / bind_tools
          anthropic.py
          openai_compatible.py
          fake.py                  # deterministic, for tests and evals
          factory.py
        obs/
          logging.py               # structured; request, user, turn, tool ids
          tracing.py
          metrics.py
        ratelimit.py
      tests/
      evals/
        cases/                     # scenario fixtures
        runner.py
        metrics.py

### The backend additions

    apps/server/
      migrations/00010_penny.sql
      internal/domain/penny/       # pure: conversation, message, memory,
                                   # tool descriptor, scope rules, redaction
      internal/modules/penny/
        service.go                 # conversation lifecycle, orchestrates a turn
        agent_client.go            # HTTP/SSE client to apps/penny
        token.go                   # mints and verifies per-turn tool tokens
        ratelimit.go
        tools/
          registry.go              # the ONLY list of callable tools
          gateway.go               # validate, authorize, dispatch, audit
          profile.go  household.go  pantry.go  mealplans.go
          grocery.go  benefits.go   resources.go  budget.go
        memory/store.go            # user-scoped long-term memory
        knowledge/                 # ingest, chunk, embed, search
      internal/db/penny_store.go
      internal/http/penny.go       # SSE endpoint
      knowledge/                   # authored authoritative content, versioned

Persona lives in `penny/persona/`. Business logic lives in `policy/`, `tools/`
and the Go services. A change to Penny's warmth must not be able to change what
she is allowed to do, and the file layout is what makes that true.

## 4. Tools

Read tools. Cheap, safe, called freely.

| Tool | Backs onto |
|---|---|
| `profile.get` | `users.Viewer` |
| `household.get` | `users.Viewer` (household size, ZIP) |
| `pantry.list` | `pantry.List` |
| `pantry.expiring` | `pantry.List` + expiry window |
| `mealplan.current` | `mealplans.Current` |
| `mealplan.get` | `mealplans.Get` |
| `grocery.list` | `grocery.List` |
| `benefits.profile_status` | `domain/benefits` — what is answered, what is missing |
| `benefits.programs` | benefits catalogue (new) |
| `resources.search` | resources service (new) |
| `resources.get` | resources service (new) |
| `budget.summary` | preferences + spend (new) |
| `knowledge.search` | RAG corpus |
| `memory.recall` | long-term memory store |

Write tools. Every one runs inside an authenticated Help The Hive service.

| Tool | Service | Confirm |
|---|---|---|
| `pantry.add` | `updatePantry()` / `pantry.Add` | auto |
| `pantry.update` | `pantry.Update` | auto |
| `pantry.mark_used` | `pantry.MarkUsed` | auto |
| `mealplan.generate` | `generateMealPlan()` | **user** |
| `mealplan.swap` | `mealplans.Swap` | auto |
| `mealplan.move` | `mealplans.Move` | auto |
| `grocery.create` | `createGroceryList()` | **user** |
| `grocery.check_item` | `grocery.SetItemChecked` | auto |
| `resources.save` | `saveResource()` | auto |
| `budget.set_weekly` | `users.UpdatePreferences` | **user** |
| `memory.upsert` | memory store | auto |

Benefits are read and draft only. Penny never submits an application and never
states that one was submitted. A wrong answer on a benefits form is a false
statement to a government agency made in the applicant's name; that is the
domain package's stated reason for existing, and Penny inherits it.

"Confirm: user" means the tool returns a `proposed_action` instead of executing.
The app renders it as a card. The backend executes only on an explicit tap. The
model can propose a $180 grocery list; it cannot create one behind the user's
back.

## 5. Memory

### Short-term — the conversation

Owned by the Go backend in `penny_messages`, keyed by conversation. The agent is
stateless between turns and receives a prepared window: the last N turns in full,
plus a rolling summary of everything older, plus the pending tool results for the
current turn.

Rolling summarization runs server-side on a token budget, not on a turn count,
and the summary is stored so it is computed once rather than per request.

The agent holding no conversation state is what makes it horizontally scalable
and what keeps the transcript inside the same database, backup and deletion path
as the rest of the user's data. `deleteViewerData` already exists; Penny's
history must fall under it.

### Long-term — what Penny remembers about you

A separate, small, user-scoped store: durable facts worth carrying across
conversations. Namespaced `(user_id, kind)`, embedded with pgvector for semantic
recall.

    kind = preference   "cooks for 4 on weeknights, one vegetarian"
    kind = constraint   "no shellfish"          (advisory to Penny, never
                                                 authoritative for allergens —
                                                 the meal engine owns that)
    kind = situation    "applying for LIHEAP in Ohio, submitted 2026-02"
    kind = goal         "wants groceries under $120/week"

Rules that keep it honest:

- Written only through `memory.upsert`, which goes to the Go store like any
  other write. No silent capture of raw user text.
- A memory is an extracted, structured claim with a source turn id and a
  timestamp, so a stale one can be found and expired.
- Never a substitute for authoritative data. If Penny needs the household size
  she calls `household.get`; she does not recall it. Memory shapes tone and
  anticipates needs; it never becomes an input to a benefits form or an
  allergen filter.
- Precise recall, not everything. Top-k semantically relevant memories per turn,
  under a token budget, never the whole store.
- The user can see and delete them. Memory the user cannot inspect is
  surveillance.

The distinction in one line: **short-term memory is what was said, long-term
memory is what was learned, and neither is ever trusted as a source of fact.**

## 6. RAG

Penny answers benefits questions from a retrieved corpus, never from model
recall. SNAP income limits change. A model's training data does not.

Corpus: authored Help The Hive knowledge in `apps/server/knowledge/`, Markdown
with front matter.

    ---
    id: snap-income-limits-oh-2026
    program: SNAP
    jurisdiction: US-OH
    effective_date: 2026-10-01
    review_by: 2027-10-01
    source_url: https://...
    authority: state-agency
    ---

Pipeline: author -> chunk on heading boundaries -> embed -> store in
`penny_knowledge_chunks` (pgvector) -> retrieve filtered by program and by the
user's jurisdiction -> cite.

Retrieval rules:

- Jurisdiction filter first. Ohio SNAP rules must never be retrieved for a Texas
  user just because they embed similarly.
- Relevance floor. If nothing clears it, Penny says she does not know and offers
  the official source. She does not fill the gap from the model.
- Every benefits claim carries a citation the app can render.
- Expired content (`review_by` in the past) is retrievable but marked, and Penny
  says the date it was last reviewed.

This is also the answer to "do not put all of this in one giant system prompt."
The prompt holds persona and rules — a page, versioned, testable. Facts arrive
per turn, scoped to the question and to the jurisdiction. A new state guide is a
Markdown file, not a prompt edit; and there is no prompt long enough to hold
fifty states, which is the point.

## 7. Provider abstraction

    class Provider(Protocol):
        name: str
        def bind_tools(self, tools) -> Provider: ...
        async def complete(self, req: Completion) -> Response: ...
        async def stream(self, req: Completion) -> AsyncIterator[Chunk]: ...

Implementations: `anthropic`, `openai_compatible`, `fake`. Chosen by env at
start-up; a misconfigured provider fails loudly then rather than silently on a
user's first message.

This mirrors `internal/modules/mealgen/provider`, which already does exactly
this for the meal narrator, including a `Disabled` default so the product works
with no provider at all. Penny follows that precedent: the model name lives in
config, the key is read server-side and never logged or returned, and the mobile
bundle knows no provider exists.

`fake` matters as much as the real ones. Evals and tests need a deterministic,
free, offline provider or they will not be run.

## 8. Safety and permissions

Seven layers, each of which assumes the ones above it failed.

1. **Transport.** Better Auth JWT verified by the existing middleware. No token,
   no turn.
2. **Rate limit.** Per user and per conversation, on turns and on tool calls.
   A prompt-injected loop must run out of budget, not out of money.
3. **Router.** The intent classifier decides which tools the model can even see.
   A pantry question is not shown `budget.set_weekly`. Reducing the surface is
   more reliable than instructing the model not to use it.
4. **Prompt.** Persona plus hard rules: no eligibility determinations, no
   medical, legal or investment advice, never claim an application was
   submitted, never state a number that did not come from a tool or a citation.
5. **Tool gateway — the real boundary.** Per-turn token verified. Tool must be
   in the registry. Arguments must validate against the schema. Scope must
   permit it. Ownership is re-checked inside the existing service, against the
   authenticated identity, not against an id the model supplied. High-impact
   writes return a proposal instead of executing.
6. **Output guard.** Response validated before it reaches the user: required
   disclaimers present, citations present on benefits claims, no invented
   figures, refusals passed through verbatim rather than paraphrased.
7. **Audit.** Every tool call — proposed, allowed, denied, executed — recorded
   with turn id, arguments and outcome. Redacted. Queryable.

Untrusted content: a resource description, an imported recipe or a retrieved
chunk is data, never instruction. Retrieved text enters the prompt inside a
delimited, labelled block, and the guard rejects a response that acts on
instructions found there.

Penny's own limits, stated plainly: she does not decide eligibility, she informs
about it. She does not give medical, legal or investment advice. She does not
submit anything. The existing `PENNY_DISCLAIMER` in the app is the floor, not the
ceiling.

## 9. Evals and tests

Unit tests for the router, tool schemas, guard, redaction, memory extraction and
each provider adapter against `fake`.

Contract tests: every tool in the Python registry has a matching Go handler and
an identical schema. A drift here is a runtime failure in front of a user, so it
is a build failure instead.

Integration tests through a real Postgres, in the style of the existing
`meals_integration_test.go`: a turn that generates a meal plan really writes a
plan, and a turn from user A can never read user B's pantry.

Evals in `apps/penny/evals/`, scenario fixtures with assertions:

- refusals — eligibility, medical, legal, "did you submit my application"
- grounding — no figure Penny states is absent from a tool result or a citation
- tool selection — the right tool, the right arguments, no write without confirm
- injection — a hostile resource description does not cause a tool call
- jurisdiction — an Ohio user is never shown Texas SNAP rules
- memory — a fact stated in turn 2 is recalled in a later conversation, and a
  corrected fact supersedes the old one

Run against `fake` in CI on every change; against the real provider on a
schedule, because that run costs money and is non-deterministic.

---

# Delivered

What follows is what was built against the design above, and where it differs.

## Transport: REST, not GraphQL

The design implied GraphQL for history. It is REST, under `/penny/*`, for two
reasons: the mobile app's Penny seam already declared those paths, and a turn
streams — which a GraphQL query cannot do without subscriptions and a transport
the app does not have. The benefits PDF route already set the precedent for a
non-GraphQL endpoint on this server.

| Route | Auth | Purpose |
|---|---|---|
| `GET /penny/conversations` | user bearer | list |
| `GET /penny/conversations/{id}/messages` | user bearer | history |
| `DELETE /penny/conversations/{id}` | user bearer | delete |
| `POST /penny/messages` | user bearer | one turn |
| `POST /penny/messages/stream` | user bearer | one turn, SSE |
| `POST /penny/actions/{id}/confirm` | user bearer | perform a proposed write |
| `POST /internal/penny/tools` | **service token + per-turn tool token** | the gateway |

The last row is the boundary. It sits outside the user auth middleware because
its caller is a service rather than a person, and the path says `internal` so
that anyone reading an access log or an ingress rule can see it is not a client
route.

## The per-turn tool token

Not in the original sketch, and the most important thing added to it.

The agent could have been given the user's bearer token. That would have let it
do anything the user can do, for as long as the token lasts, from anywhere — and
the agent is the process that hands text to a third-party model, so it is the
one least entitled to that.

Instead the server mints an HMAC-signed token per turn carrying the user id, the
conversation, the router's scope grant and a 90-second expiry. Tool calls run as
that identity and no other; nothing in a model's tool arguments can change it.
Revocation is by expiry, because a finished turn has no use for its token.

## Tool status

Twenty-two of twenty-five tools are implemented. `resources.search`,
`resources.get` and `resources.save` are registered with a stated reason —
Help The Hive has no resources service yet — so Penny says "I can't look up
local resources yet" instead of failing in a way that reads like a bug. A test
asserts every registry entry has either a handler or a reason, and that nothing
implemented is missing from the registry.

`benefits.programs` and `benefits.profile_status` are wired to the real benefits
service. The interface they are given has no `StartApplication`, no `Approve` and
no `Document`: Penny cannot fill in, approve or submit a government form, because
the methods are not reachable from her side of the boundary.

## Ranking is lexical, not semantic

Memory recall and knowledge retrieval use Postgres full-text search. The
`embedding` columns exist and are null.

This is a deliberate first step rather than a shortcut. What makes memory safe is
its scoping, its four kinds and its supersession rule; what makes retrieval safe
is that jurisdiction is a `WHERE` clause rather than a scoring term. None of that
changes when the ranking does — swapping in pgvector changes one `ORDER BY` and
adds an embed call to the ingest path.

## Two bugs the tests found

Worth recording, because both were in the safety layer.

The guard's eligibility patterns rejected *"Whether you qualify depends on your
income, and only the agency can tell you"* — which is the correct answer to the
question, and contains the same three words as the sentence Penny must never say.
RE2 has no lookbehind, so `hedged()` now walks back to the start of the clause
and looks for a conditional marker. A hedge in a *following* sentence does not
excuse a flat assertion; there is a test for that too.

The injection pattern missed *"Ignoring my previous instructions"* because it
allowed only one determiner between the verb and the noun.

Neither would have been found by reading the regex.

## Not yet built

- Conversation summarisation. The column, the contract and the resume point
  (`summarized_through`) exist; the window is currently a fixed twelve turns.
- Semantic recall, as above.
- The resources module, which is backend work rather than Penny work.
- Knowledge ingest. The schema, the store and the retrieval query are done;
  authoring the SNAP/WIC/Medicaid/LIHEAP corpus and the ingest command are not.
- Prometheus metrics. Structured logging and the audit table are in.
