"""Running what the model asked for — by asking somebody else to run it.

Every call in this node leaves the process. Nothing here reads or writes
anything; it packages a request, sends it to the Help The Hive gateway, and puts
the answer back into the transcript. A call the server denies comes back denied,
and the model is told so in terms that discourage looking for a way around it.
"""

from __future__ import annotations

import asyncio

from penny.graph.state import PennyState
from penny.obs.logging import logger
from penny.providers.base import Message
from penny.tools.gateway import ToolGateway, ToolOutcome


async def act(state: PennyState, gateway: ToolGateway, max_tool_calls: int) -> PennyState:
    calls = state["messages"][-1].tool_calls
    made = state.get("tool_calls_made", 0)

    remaining = max_tool_calls - made
    if remaining <= 0:
        # The budget is spent. The model is told, in the transcript, so its next
        # turn is an answer rather than another call — and the loop cannot
        # continue either way, because the router below will not come back here.
        return {
            "messages": [
                *state["messages"],
                *[
                    Message(
                        role="tool",
                        tool_call_id=call.id,
                        content="FAILED: this conversation has used its tool budget. Answer with what you already have.",
                    )
                    for call in calls
                ],
            ],
            "tool_calls_made": made,
        }

    # Concurrently, because a turn that reads the pantry and the plan should
    # take as long as the slower of the two. They are independent by
    # construction: each one's authority comes from the token, not from the
    # others.
    outcomes = await asyncio.gather(
        *[
            gateway.call(state["tool_token"], state["turn_id"], call.name, call.arguments)
            for call in calls[:remaining]
        ]
    )

    messages = list(state["messages"])
    citations: list[dict] = []
    proposed = state.get("proposed_action")

    for call, outcome in zip(calls, outcomes):
        logger().info(
            "tool call",
            tool=outcome.tool,
            ok=outcome.ok,
            denied=outcome.denied,
            proposed=bool(outcome.proposed),
        )
        messages.append(
            Message(role="tool", tool_call_id=call.id, content=outcome.for_model())
        )
        citations.extend(_citations(outcome))
        # One proposal per turn. A model that proposes two things has asked the
        # user two questions at once, and the app has one confirmation card.
        if outcome.proposed and proposed is None:
            proposed = outcome.proposed

    return {
        "messages": messages,
        "tool_calls_made": made + len(outcomes),
        "citations": citations,
        "proposed_action": proposed,
    }


def _citations(outcome: ToolOutcome) -> list[dict]:
    """Citations come only from knowledge.search.

    They are collected here, from the tool result, rather than being asked of
    the model. A model that writes its own citations writes plausible ones.
    """
    if outcome.tool != "knowledge.search" or not isinstance(outcome.result, dict):
        return []
    return [
        passage["citation"]
        for passage in outcome.result.get("passages", [])
        if isinstance(passage, dict) and passage.get("citation")
    ]
