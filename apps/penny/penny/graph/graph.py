"""The graph.

Four nodes and one decision. It is meant to be readable start to finish by
somebody who has never used LangGraph, because this is the file that answers
"what actually happens when a user sends a message".

    prepare ─► agent ─┬─(no tool calls)─► finish
                      │
                      └─(tool calls)───► act ─► agent ─► …

The loop between agent and act is bounded twice over: by the tool budget this
process enforces, and by the per-user budget the Go server enforces against its
audit log. Two limits because the first one protects the user's turn and the
second protects the operator's bill.
"""

from __future__ import annotations

from functools import partial

from langgraph.graph import END, StateGraph

from penny.graph.nodes.act import act
from penny.graph.nodes.agent import agent
from penny.graph.nodes.prepare import prepare
from penny.graph.state import PennyState
from penny.providers.base import Provider
from penny.tools.gateway import ToolGateway


def build(provider: Provider, gateway: ToolGateway, max_tool_calls: int, max_tokens: int):
    """Compiles the turn graph.

    No checkpointer is attached, deliberately. LangGraph's checkpointers persist
    conversation state where the graph runs, and this process is the one with no
    database and no business holding a transcript. The Go server is the memory:
    it sends the window in and stores the result.
    """
    graph = StateGraph(PennyState)

    graph.add_node("prepare", prepare)
    graph.add_node("agent", partial(agent, provider=provider, max_tokens=max_tokens))
    graph.add_node("act", partial(act, gateway=gateway, max_tool_calls=max_tool_calls))

    graph.set_entry_point("prepare")
    graph.add_edge("prepare", "agent")
    graph.add_conditional_edges("agent", _next, {"act": "act", "end": END})
    graph.add_edge("act", "agent")

    return graph.compile()


def _next(state: PennyState) -> str:
    """Whether the model asked for anything.

    A failed provider call ends the turn rather than looping: there is nothing
    to act on, and retrying inside the graph would multiply a vendor outage by
    the number of nodes.
    """
    if state.get("outcome") == "failed":
        return "end"

    messages = state.get("messages") or []
    if not messages:
        return "end"

    last = messages[-1]
    if last.role == "assistant" and last.tool_calls:
        return "act"
    return "end"
