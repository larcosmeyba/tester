"""The first node: build the prompt.

Everything the model will see is assembled here, in one place, so that the
question "what did Penny know when she said that?" has a single answer.
"""

from __future__ import annotations

from penny.graph.state import PennyState
from penny.persona import voice
from penny.policy.safety import system_prompt
from penny.providers.base import Message


def prepare(state: PennyState) -> PennyState:
    messages: list[Message] = [
        Message(
            role="system",
            content=system_prompt(
                persona=voice(),
                user_first_name=state.get("user_first_name", ""),
                jurisdiction=state.get("jurisdiction", ""),
            ),
        )
    ]

    # Everything older than the live window arrives as one paragraph the server
    # wrote. It is framed as a summary rather than pasted in as dialogue, so the
    # model does not mistake a paraphrase for something the user actually said.
    if summary := state.get("summary", ""):
        messages.append(
            Message(
                role="system",
                content="Earlier in this conversation, summarised: " + summary,
            )
        )

    messages.extend(state.get("history", []))
    messages.append(Message(role="user", content=state["input"]))

    return {"messages": messages, "tool_calls_made": 0, "citations": [], "outcome": "ok"}
