"""What a turn carries as it moves through the graph.

Penny is stateless between turns. Everything below is built at the start of a
request from what the Go backend sent, and discarded when it finishes — the
transcript, the memories and the audit trail all live on the server, inside the
same backup and deletion path as the rest of the user's data.

That is a deliberate cost. It means a summary must be recomputed rather than
cached here, and it means this process can be restarted, scaled or replaced
without losing anybody's conversation.
"""

from __future__ import annotations

from typing import Annotated, Any, TypedDict

from penny.providers.base import Message, ToolSpec


def replace(_: Any, new: Any) -> Any:
    """Last write wins.

    LangGraph merges state with a reducer per key. The default for these fields
    is replacement rather than accumulation: a node that recomputes the scopes
    means them to be the scopes, not to be added to the old ones.
    """
    return new


def extend(current: list, new: list) -> list:
    return [*current, *new]


class PennyState(TypedDict, total=False):
    # --- given by the backend, never changed ---
    turn_id: str
    conversation_id: str
    tool_token: str
    user_first_name: str
    jurisdiction: str
    input: str
    # Everything older than the live window, as one paragraph the server wrote.
    summary: str
    # The live window: recent turns, verbatim, oldest first.
    history: list[Message]

    # --- the prompt, assembled ---
    messages: Annotated[list[Message], replace]
    tools: Annotated[list[ToolSpec], replace]

    # --- what happened ---
    tool_calls_made: Annotated[int, replace]
    citations: Annotated[list[dict], extend]
    proposed_action: Annotated[dict | None, replace]
    text: Annotated[str, replace]
    provider: str
    model: str
    outcome: Annotated[str, replace]
