"""Replays the eval cases against a graph wired to the fake provider.

The stubbed backend is the important part. It lets a case put hostile content —
an injected instruction inside a resource description — in front of the model
without hosting any, and it lets a grounding case return nothing so that
"Penny does not know" can be asserted rather than hoped for.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest
import yaml

from penny.api.schemas import ToolDescriptor, TurnRequest, TurnUser
from penny.graph.graph import build
from penny.providers.fake import FakeProvider
from penny.tools.gateway import ToolGateway, ToolOutcome

CASES = Path(__file__).parent / "cases"


@dataclass
class Recorder:
    """A gateway stand-in that records rather than calls.

    Subclassing the real gateway would need a live server; this replaces its one
    outbound method, so the graph, the nodes and the message shaping are all the
    real ones.
    """

    stub: dict[str, Any] = field(default_factory=dict)
    calls: list[tuple[str, dict]] = field(default_factory=list)

    async def call(self, tool_token: str, turn_id: str, name: str, arguments: dict) -> ToolOutcome:
        self.calls.append((name, arguments))

        if self.stub.get("tool") == name:
            if self.stub.get("denied"):
                return ToolOutcome(tool=name, denied=True, error="not available")
            if proposed := self.stub.get("proposed"):
                return ToolOutcome(tool=name, proposed=proposed)
            return ToolOutcome(tool=name, result=self.stub.get("result"))

        if self.stub.get("nothing"):
            return ToolOutcome(tool=name, result=None)
        return ToolOutcome(tool=name, result=[])

    @property
    def called(self) -> list[str]:
        return [name for name, _ in self.calls]


def load(name: str) -> list[dict]:
    return yaml.safe_load((CASES / name).read_text(encoding="utf-8")) or []


def _tools() -> list[ToolDescriptor]:
    """The full registry as descriptors, minus what routing would withhold.

    Cases that assert a tool was not offered set their own narrower list.
    """
    names = [
        ("pantry.list", "pantry", "read", ["location"]),
        ("pantry.expiring", "pantry", "read", ["within_days"]),
        ("mealplan.current", "mealplan", "read", []),
        ("mealplan.generate", "mealplan", "confirm", ["days", "budget"]),
        ("grocery.create", "grocery", "confirm", ["plan_id"]),
        ("knowledge.search", "knowledge", "read", ["query", "program"]),
        ("memory.recall", "memory", "read", ["query", "kind"]),
        ("memory.upsert", "memory", "write", ["kind", "content", "context", "supersedes"]),
        ("resources.search", "resources", "read", ["query"]),
        ("budget.summary", "budget", "read", []),
    ]
    return [
        ToolDescriptor(Name=n, Scope=s, Risk=r, Description=n, Arguments=a) for n, s, r, a in names
    ]


async def run(case: dict, tools: list[ToolDescriptor] | None = None) -> tuple[str, Recorder]:
    recorder = Recorder(stub=_stub(case))
    graph = build(FakeProvider(), recorder, max_tool_calls=4, max_tokens=500)  # type: ignore[arg-type]

    offered = tools if tools is not None else _tools()
    if excluded := case.get("assert_tool_not_offered"):
        offered = [tool for tool in offered if tool.Name != excluded]

    request = TurnRequest(
        turn_id="eval-turn",
        conversation_id="eval-conv",
        tool_token="eval-token",
        user=TurnUser(first_name="Sam", jurisdiction=case.get("user_jurisdiction", "US-OH")),
        input=case["input"],
        tools=offered,
    )

    from penny.api.chat import _initial, _result

    state = await graph.ainvoke(_initial(request))
    return _result(state).text, recorder


def _stub(case: dict) -> dict[str, Any]:
    if case.get("tools_return_nothing"):
        return {"nothing": True}
    if stub := case.get("tool_result"):
        return dict(stub)
    if case.get("expect_proposal") and (tool := case.get("expect_tool")):
        return {"tool": tool, "proposed": {"id": "action-1", "tool": tool, "summary": f"Run {tool}."}}
    return {}


def check(case: dict, text: str, recorder: Recorder) -> None:
    for pattern in case.get("must_match", []):
        assert re.search(pattern, text), f"{case['id']}: expected /{pattern}/ in {text!r}"
    for pattern in case.get("must_not_match", []):
        assert not re.search(pattern, text), f"{case['id']}: forbidden /{pattern}/ in {text!r}"
    for forbidden in case.get("must_not_call", []):
        assert forbidden not in recorder.called, f"{case['id']}: called {forbidden}"
    if excluded := case.get("assert_tool_not_offered"):
        assert excluded not in recorder.called, f"{case['id']}: called an unoffered tool {excluded}"


# --- the suites -----------------------------------------------------------
#
# Each file is its own test so a failure names the class of problem rather than
# "evals failed". Cases needing a full backend are skipped with a reason rather
# than silently passing, because a green suite that asserted nothing is worse
# than a red one.

MULTI_TURN_KEYS = {"turns", "assert_no_facts_absent_from_tool_results", "assert_no_novel_numbers",
                   "assert_no_write_executed", "assert_no_retry",
                   "assert_no_citation_from_jurisdiction", "expect_arguments",
                   "expect_arguments_present", "new_conversation"}


@pytest.mark.parametrize("case", load("refusals.yaml"), ids=lambda c: c["id"])
async def test_refusals(case: dict) -> None:
    text, recorder = await run(case)
    check(case, text, recorder)


@pytest.mark.parametrize("case", load("injection.yaml"), ids=lambda c: c["id"])
async def test_injection(case: dict) -> None:
    text, recorder = await run(case)
    check(case, text, recorder)


@pytest.mark.parametrize("case", load("grounding.yaml"), ids=lambda c: c["id"])
async def test_grounding(case: dict) -> None:
    if MULTI_TURN_KEYS & case.keys():
        pytest.skip(f"{case['id']} needs the integration harness (a live backend)")
    text, recorder = await run(case)
    check(case, text, recorder)


@pytest.mark.parametrize("case", load("tools.yaml"), ids=lambda c: c["id"])
async def test_tools(case: dict) -> None:
    if MULTI_TURN_KEYS & case.keys():
        pytest.skip(f"{case['id']} needs the integration harness (a live backend)")
    text, recorder = await run(case)
    check(case, text, recorder)
    if expected := case.get("expect_tool"):
        assert expected in recorder.called, f"{case['id']}: did not call {expected}"


@pytest.mark.parametrize("case", load("memory.yaml"), ids=lambda c: c["id"])
async def test_memory(case: dict) -> None:
    if MULTI_TURN_KEYS & case.keys():
        pytest.skip(f"{case['id']} needs the integration harness (a live backend)")
    text, recorder = await run(case)
    check(case, text, recorder)
