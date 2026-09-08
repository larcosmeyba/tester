"""Any provider speaking the chat-completions shape.

This is the escape hatch: a vendor becomes a base URL and a model name rather
than a code change. It mirrors the same choice the Go meal provider made, so
Help The Hive is not bound to one AI company by either half of the system.

Written against httpx rather than a vendor SDK, because the whole point is not
to depend on one.
"""

from __future__ import annotations

import json
from typing import Any, AsyncIterator

import httpx

from penny.providers.base import Completion, Message, ProviderError, ToolCall, ToolSpec


class OpenAICompatibleProvider:
    name = "openai_compatible"

    def __init__(self, api_key: str, base_url: str, model: str, timeout: float) -> None:
        self.model = model
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            timeout=timeout,
            headers={"Authorization": f"Bearer {api_key}"},
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def complete(
        self, messages: list[Message], tools: list[ToolSpec], max_tokens: int
    ) -> Completion:
        payload = self._payload(messages, tools, max_tokens, stream=False)
        try:
            response = await self._client.post("/chat/completions", json=payload)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            # The body is not attached: a provider's error can echo the prompt.
            raise ProviderError("the model provider did not answer") from exc

        return self._read(response.json())

    async def stream(
        self, messages: list[Message], tools: list[ToolSpec], max_tokens: int
    ) -> AsyncIterator[str | Completion]:
        payload = self._payload(messages, tools, max_tokens, stream=True)
        text_parts: list[str] = []
        # Tool calls arrive in fragments across chunks, keyed by index.
        partial: dict[int, dict[str, Any]] = {}

        try:
            async with self._client.stream("POST", "/chat/completions", json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[len("data:") :].strip()
                    if not data or data == "[DONE]":
                        continue

                    delta = json.loads(data)["choices"][0].get("delta", {})
                    if content := delta.get("content"):
                        text_parts.append(content)
                        yield content
                    for fragment in delta.get("tool_calls", []) or []:
                        _merge(partial, fragment)
        except httpx.HTTPError as exc:
            raise ProviderError("the model provider did not answer") from exc

        yield Completion(
            text="".join(text_parts).strip(),
            tool_calls=[_finish(fragment) for fragment in partial.values()],
            provider=self.name,
            model=self.model,
        )

    def _payload(
        self, messages: list[Message], tools: list[ToolSpec], max_tokens: int, stream: bool
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [_message(message) for message in messages],
            "max_tokens": max_tokens,
            "temperature": 0.3,
            "stream": stream,
        }
        if tools:
            payload["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": tool.name.replace(".", "__"),
                        "description": tool.description,
                        "parameters": tool.json_schema(),
                    },
                }
                for tool in tools
            ]
        return payload

    def _read(self, body: dict[str, Any]) -> Completion:
        choices = body.get("choices") or []
        if not choices:
            raise ProviderError("the model provider returned no content")

        message = choices[0].get("message", {})
        calls = [
            ToolCall(
                id=call.get("id", ""),
                name=call["function"]["name"].replace("__", "."),
                arguments=_arguments(call["function"].get("arguments")),
            )
            for call in message.get("tool_calls") or []
        ]
        usage = body.get("usage") or {}
        return Completion(
            text=(message.get("content") or "").strip(),
            tool_calls=calls,
            provider=self.name,
            model=self.model,
            input_tokens=usage.get("prompt_tokens", 0),
            output_tokens=usage.get("completion_tokens", 0),
        )


def _message(message: Message) -> dict[str, Any]:
    if message.role == "tool":
        return {"role": "tool", "tool_call_id": message.tool_call_id, "content": message.content}
    if message.role == "assistant" and message.tool_calls:
        return {
            "role": "assistant",
            "content": message.content or None,
            "tool_calls": [
                {
                    "id": call.id,
                    "type": "function",
                    "function": {
                        "name": call.name.replace(".", "__"),
                        "arguments": json.dumps(call.arguments),
                    },
                }
                for call in message.tool_calls
            ],
        }
    return {"role": message.role, "content": message.content}


def _arguments(raw: Any) -> dict:
    """Arguments arrive as a JSON string, and occasionally as broken JSON.

    A model that emitted unparseable arguments has not asked for anything
    coherent, so this returns empty and lets the server reject the call for a
    missing required argument — which is a message the model can act on.
    """
    if isinstance(raw, dict):
        return raw
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _merge(partial: dict[int, dict[str, Any]], fragment: dict[str, Any]) -> None:
    index = fragment.get("index", 0)
    entry = partial.setdefault(index, {"id": "", "name": "", "arguments": ""})
    if identifier := fragment.get("id"):
        entry["id"] = identifier
    function = fragment.get("function") or {}
    if name := function.get("name"):
        entry["name"] = name
    if arguments := function.get("arguments"):
        entry["arguments"] += arguments


def _finish(fragment: dict[str, Any]) -> ToolCall:
    return ToolCall(
        id=fragment["id"],
        name=fragment["name"].replace("__", "."),
        arguments=_arguments(fragment["arguments"]),
    )
