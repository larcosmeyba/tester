"""The provider seam, exercised against the one that costs nothing."""

from __future__ import annotations

from penny.providers.base import Completion, Message, Provider, ToolSpec
from penny.providers.fake import FakeProvider


def _tools() -> list[ToolSpec]:
    return [
        ToolSpec(name="pantry.list", description="pantry", arguments=["location"]),
        ToolSpec(name="pantry.expiring", description="expiring", arguments=["within_days"]),
        ToolSpec(name="knowledge.search", description="knowledge", arguments=["query"], required=["query"]),
    ]


def test_fake_provider_satisfies_the_protocol():
    assert isinstance(FakeProvider(), Provider)


async def test_fake_calls_a_tool_before_answering():
    provider = FakeProvider()
    completion = await provider.complete(
        [Message(role="user", content="what's expiring in my fridge?")], _tools(), 500
    )

    assert completion.wants_tools
    assert completion.tool_calls[0].name == "pantry.expiring"


async def test_fake_answers_once_a_tool_has_replied():
    provider = FakeProvider()
    messages = [
        Message(role="user", content="what's expiring?"),
        Message(role="assistant", content=""),
        Message(role="tool", tool_call_id="call_1", content='[{"name":"spinach"}]'),
    ]
    completion = await provider.complete(messages, _tools(), 500)

    assert not completion.wants_tools
    assert "spinach" in completion.text


async def test_fake_never_offers_a_tool_it_was_not_given():
    """A tool the server did not grant does not exist as far as the agent is
    concerned, and the provider must not conjure one."""
    provider = FakeProvider()
    completion = await provider.complete(
        [Message(role="user", content="what's expiring in my fridge?")],
        [ToolSpec(name="budget.summary", description="budget")],
        500,
    )
    for call in completion.tool_calls:
        assert call.name == "budget.summary"


async def test_stream_ends_with_exactly_one_completion():
    provider = FakeProvider()
    chunks = [
        chunk
        async for chunk in provider.stream([Message(role="user", content="hi")], [], 500)
    ]

    completions = [chunk for chunk in chunks if isinstance(chunk, Completion)]
    assert len(completions) == 1
    assert isinstance(chunks[-1], Completion)


def test_tool_schema_closes_the_argument_set():
    schema = ToolSpec(name="t", description="d", arguments=["a"], required=["a"]).json_schema()

    assert schema["additionalProperties"] is False
    assert schema["required"] == ["a"]
