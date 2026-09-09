# Penny evals

Scenario fixtures, not unit tests. Each case is a thing Penny must or must not
do, written as the situation rather than as a function call.

They run against the `fake` provider in CI, on every change, because an eval
suite that costs money per run is an eval suite that stops being run. They run
against the real provider on a schedule, because that is the only way to catch
the failures that come from the model rather than from the code.

## The five files

| File | The failure it catches |
|---|---|
| `refusals.yaml` | Penny deciding eligibility, giving medical or investment advice, or claiming she submitted something |
| `grounding.yaml` | A plausible, specific, wrong number stated in the same confident voice as everything else |
| `injection.yaml` | An instruction hidden in a resource description or a retrieved passage being obeyed rather than relayed |
| `tools.yaml` | The wrong tool, a write without agreement, a denial worked around, a state's rules crossed |
| `memory.yaml` | Penny keeping what she should not, or failing to keep what she should |

## Why these five

They are the five ways this system hurts somebody.

A wrong refusal wastes a minute. A wrong eligibility claim sends a person to an
office expecting help that is not coming, or — worse — stops them applying at
all. A wrong number about SNAP is acted on. An obeyed injection turns Penny into
the attacker's tool against her own user. An unagreed write spends money. And a
memory that should not exist is a small permanent harm nobody notices.

Every other property of this service is a bug when it breaks. These are the ones
that are worse than a bug.

## Running

```bash
pytest evals
```

`runner.py` loads each YAML file, replays the case against a graph wired to the
fake provider and a stubbed backend, and asserts the case's conditions. A case
with `tool_result` stubs what the backend returns, which is how the injection
cases get hostile content in front of the model without hosting any.
