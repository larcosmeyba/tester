"""Claude, through the Anthropic SDK.

The SDK is an optional dependency. Penny runs on the fake provider with it
uninstalled, so a developer who only wants to work on the graph does not need a
vendor account.
"""

from __future__ import annotations

from typing import Any, AsyncIterator

from penny.providers.base import Completion, Message, ProviderError, ToolCall, ToolSpec


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, model: str, timeout: float) -> None:
        try:
            from anthropic import AsyncAnthropic
        except ImportError as exc:  # pragma: no cover - import guard
            raise ProviderError(
                "PENNY_PROVIDER=anthropic needs the anthropic package: pip install '.[anthropic]'"
            ) from exc

        self.model = model
        self._client = AsyncAnthropic(api_key=api_key, timeout=timeout)

    async def complete(
        self, messages: list[Message], tools: list[ToolSpec], max_tokens: int
    ) -> Completion:
        system, turns = _split(messages)
        try:
            response = await self._client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=turns,
                tools=[_tool(tool) for tool in tools] or None,
                temperature=0.3,
            )
        except Exception as exc:  # noqa: BLE001 - the body is not safe to keep
            raise ProviderError("the model provider did not answer") from exc

        return _completion(response, self.name, self.model)

    async def stream(
        self, messages: list[Message], tools: list[ToolSpec], max_tokens: int
    ) -> AsyncIterator[str | Completion]:
        system, turns = _split(messages)
        try:
            async with self._client.messages.stream(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=turns,
                tools=[_tool(tool) for tool in tools] or None,
                temperature=0.3,
            ) as stream:
                async for text in stream.text_stream:
                    yield text
                yield _completion(await stream.get_final_message(), self.name, self.model)
        except Exception as exc:  # noqa: BLE001
            raise ProviderError("the model provider did not answer") from exc


def _split(messages: list[Message]) -> tuple[str, list[dict[str, Any]]]:
    """Anthropic takes the system prompt as its own parameter, not a message."""
    system = "\n\n".join(m.content for m in messages if m.role == "system")
    turns: list[dict[str, Any]] = []

    for message in messages:
        if message.role == "system":
            continue
        if message.role == "tool":
            turns.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": message.tool_call_id,
                            "content": message.content,
                        }
                    ],
                }
            )
            continue
        if message.role == "assistant" and message.tool_calls:
            content: list[dict[str, Any]] = []
            if message.content:
                content.append({"type": "text", "text": message.content})
            content.extend(
                {"type": "tool_use", "id": call.id, "name": call.name, "input": call.arguments}
                for call in message.tool_calls
            )
            turns.append({"role": "assistant", "content": content})
            continue
        turns.append({"role": message.role, "content": message.content})

    return system, turns


def _tool(tool: ToolSpec) -> dict[str, Any]:
    return {
        "name": tool.name.replace(".", "__"),
        "description": tool.description,
        "input_schema": tool.json_schema(),
    }


def _completion(response: Any, provider: str, model: str) -> Completion:
    text_parts: list[str] = []
    calls: list[ToolCall] = []

    for block in response.content:
        if block.type == "text":
            text_parts.append(block.text)
        elif block.type == "tool_use":
            # Dots are restored: the vendor's name rules are the vendor's
            # problem, and the server's registry is the source of truth.
            calls.append(
                ToolCall(id=block.id, name=block.name.replace("__", "."), arguments=dict(block.input))
            )

    usage = getattr(response, "usage", None)
    return Completion(
        text="".join(text_parts).strip(),
        tool_calls=calls,
        provider=provider,
        model=model,
        input_tokens=getattr(usage, "input_tokens", 0) or 0,
        output_tokens=getattr(usage, "output_tokens", 0) or 0,
    )
