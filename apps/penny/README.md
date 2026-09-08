# Penny

The Help The Hive conversational assistant. A tool-using agent: almost every
useful thing Penny says is a fact she fetched through an authenticated Help The
Hive service, not a sentence she composed from memory.

## The one rule

**This process has no database credentials, and must never be given any.**

There is no `DATABASE_URL` in `.env.example`. There is no driver in
`pyproject.toml`. `GET /health/detailed` reports `"database_access": false`, so
the property is checkable from outside.

Every read and every write goes back through the Go backend, over the tool
gateway, carrying a token that server minted for one turn. "The model cannot
modify the database" is therefore a fact about the deployment rather than a rule
somebody has to remember while reviewing a pull request.

## Where a turn goes

```
Help The Hive backend  ──POST /v1/penny/turn──►  this service
                                                    │
                          prepare ─► agent ─┬─► act ─┘   (loop, bounded)
                                            └─► done
                                                    │
                       ◄──────────  TurnResult  ────┘
```

`act` is the only node that leaves the process with anything of the user's, and
it leaves for exactly one place: `POST /internal/penny/tools` on the backend.

The graph is in `penny/graph/graph.py` and is four nodes long on purpose. It
should be readable by somebody who has never used LangGraph.

## Layout

```
penny/
  config.py          settings; fails at start-up rather than mid-conversation
  main.py            one provider, one graph, two endpoints
  api/               the wire contract with the Go server, and the SSE endpoint
  graph/             state, nodes, edges
  persona/penny.md   how Penny talks. No business logic.
  policy/            what Penny may do, and what stays out of the logs
  providers/         anthropic | openai_compatible | fake
  tools/gateway.py   the entirety of this service's ability to affect anything
  obs/               structured logs, keyed by turn
tests/               unit and end-to-end, against the fake provider
evals/               the five ways this system hurts somebody
```

`persona/` and `policy/` are separate because editing Penny's warmth must not be
able to change her permissions.

## Running it

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e '.[dev]'
cp .env.example .env
uvicorn penny.main:app --reload --port 8081
```

The defaults use the `fake` provider, which needs no key and answers the same
way every time. Point `PENNY_BACKEND_URL` at a running Go server and set
`PENNY_SERVICE_TOKEN` to the same value as the server's, and the whole path
works end to end with no vendor involved.

For a real model:

```bash
PENNY_PROVIDER=anthropic PENNY_MODEL=claude-sonnet-5 PENNY_API_KEY=... uvicorn penny.main:app
```

## Tests

```bash
pytest                 # unit + end-to-end + evals, all on the fake provider
pytest evals           # just the evals
ruff check .
```

Everything runs offline and free. That is deliberate: a suite that costs money
per run is a suite that stops being run, and these are the checks that catch
Penny telling somebody they qualify for SNAP.

## What is not here yet

- Semantic recall. Memory and knowledge retrieval are lexical (Postgres full
  text) on the server side. The store, its scoping and its supersession rules
  are the parts that make it safe, and they do not change when the ranking does
  — swapping in pgvector changes one `ORDER BY`.
- The resources tools. `resources.search`, `resources.get` and `resources.save`
  are in the server's registry with a stated reason, because Help The Hive has
  no resources service yet. Penny says so rather than failing.
- Conversation summarisation. The column and the contract exist; the window is
  currently a fixed number of turns.
