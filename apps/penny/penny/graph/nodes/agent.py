"""The model's turn to speak.

The one thing worth noticing here is what this node does not do. It does not
decide whether a tool call is allowed, it does not run one, and it does not
know what any of them do. It asks the model, records what came back, and hands
over. Authority lives on the other side of the gateway.
"""

from __future__ import annotations

from penny.graph.state import PennyState
from penny.obs.logging import logger
from penny.providers.base import Completion, Message, Provider, ProviderError


async def agent(state: PennyState, provider: Provider, max_tokens: int) -> PennyState:
    try:
        completion = await provider.complete(state["messages"], state["tools"], max_tokens)
    except ProviderError:
        logger().error("provider failed", provider=provider.name, model=provider.model)
        return {
            "text": "Sorry — I couldn't get to that just now. Try again in a moment?",
            "outcome": "failed",
            "provider": provider.name,
            "model": provider.model,
        }

    return _record(state, completion, provider)


def _record(state: PennyState, completion: Completion, provider: Provider) -> PennyState:
    messages = [
        *state["messages"],
        Message(
            role="assistant",
            content=completion.text,
            tool_calls=completion.tool_calls,
        ),
    ]
    return {
        "messages": messages,
        "text": completion.text,
        "provider": completion.provider or provider.name,
        "model": completion.model or provider.model,
    }
