"""The provider seam.

Everything above this file talks about messages and tools. Everything below it
talks to a vendor. The point of the seam is that changing vendor is a config
change and a new file here, never a change to the graph, the policy or the
tools — and that the eval suite can run against a provider that costs nothing
and returns the same thing every time.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import AsyncIterator, Literal, Protocol, runtime_checkable


@dataclass(frozen=True)
class ToolSpec:
    """A tool, as the model is told about it.

    Built from what the Go server sent for this turn. The agent never invents
    one: a tool the server did not offer is a tool that does not exist.
    """

    name: str
    description: str
    arguments: list[str] = field(default_factory=list)
    required: list[str] = field(default_factory=list)

    def json_schema(self) -> dict:
        """The tool's input schema.

        Every argument is a string or a number to the model and is parsed
        strictly on the server. Loose here, strict there: a model that has been
        told a field is a string will supply one, and the server will still
        reject "seven" where it wanted a number.
        """
        return {
            "type": "object",
            "properties": {name: {"type": ["string", "number", "boolean"]} for name in self.arguments},
            "required": list(self.required),
            "additionalProperties": False,
        }


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict


@dataclass
class Message:
    role: Literal["system", "user", "assistant", "tool"]
    content: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    # Set on a tool-result message.
    tool_call_id: str | None = None


@dataclass
class Completion:
    """One model reply."""

    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    provider: str = ""
    model: str = ""
    # For metrics. Never billed to the user; used to spot a turn that ran away.
    input_tokens: int = 0
    output_tokens: int = 0

    @property
    def wants_tools(self) -> bool:
        return bool(self.tool_calls)


class ProviderError(RuntimeError):
    """A provider failed.

    Deliberately carries no vendor response body. A provider's error can echo
    the prompt back, and the prompt contains what the user typed.
    """


@runtime_checkable
class Provider(Protocol):
    name: str
    model: str

    async def complete(
        self, messages: list[Message], tools: list[ToolSpec], max_tokens: int
    ) -> Completion: ...

    async def stream(
        self, messages: list[Message], tools: list[ToolSpec], max_tokens: int
    ) -> AsyncIterator[str | Completion]:
        """Yields text as it arrives, then exactly one Completion last.

        The trailing Completion is authoritative: the deltas are a preview, and
        the guard on the Go side runs on the finished text.
        """
        ...
