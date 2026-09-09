"""A provider that costs nothing and answers the same way every time.

This is not a stub. It is the provider the test suite and the eval suite run
against, and it is the reason those suites get run at all — a grounding eval
that costs money per execution is a grounding eval nobody runs before merging.

Its behaviour is scripted from the input: it calls the obvious tool for the
question, then answers from what the tool returned. That is enough to exercise
the whole path — routing, the tool gateway, the audit log, the guard — without
a vendor being involved.
"""

from __future__ import annotations

from typing import AsyncIterator

from penny.providers.base import Completion, Message, ToolCall, ToolSpec


class FakeProvider:
    name = "fake"

    def __init__(self, model: str = "fake-1") -> None:
        self.model = model

    async def complete(
        self, messages: list[Message], tools: list[ToolSpec], max_tokens: int
    ) -> Completion:
        # A tool result in the transcript means this is the second pass: answer
        # from what came back rather than calling anything else.
        if any(message.role == "tool" for message in messages):
            return Completion(text=self._answer(messages), provider=self.name, model=self.model)

        call = self._first_call(self._last_user(messages), tools)
        if call is not None:
            return Completion(tool_calls=[call], provider=self.name, model=self.model)
        return Completion(text=self._answer(messages), provider=self.name, model=self.model)

    async def stream(
        self, messages: list[Message], tools: list[ToolSpec], max_tokens: int
    ) -> AsyncIterator[str | Completion]:
        completion = await self.complete(messages, tools, max_tokens)
        if completion.text:
            # Word by word, so a client's streaming path is exercised rather
            # than merely present.
            for word in completion.text.split(" "):
                yield word + " "
        yield completion

    @staticmethod
    def _last_user(messages: list[Message]) -> str:
        for message in reversed(messages):
            if message.role == "user":
                return message.content.lower()
        return ""

    @staticmethod
    def _first_call(text: str, tools: list[ToolSpec]) -> ToolCall | None:
        available = {tool.name for tool in tools}

        # Ordered most specific first, so "what's expiring in my pantry" picks
        # the expiry tool rather than the listing one.
        routes: list[tuple[tuple[str, ...], str, dict]] = [
            (("expiring", "expire", "going bad", "spoil"), "pantry.expiring", {"within_days": 7}),
            (("snap", "wic", "medicaid", "liheap", "benefit"), "knowledge.search", {"query": text[:120]}),
            (("pantry", "fridge", "freezer", "have in"), "pantry.list", {}),
            (("grocery", "shopping list"), "mealplan.current", {}),
            (("meal", "dinner", "cook", "plan my week"), "mealplan.current", {}),
            (("budget", "afford", "spend"), "budget.summary", {}),
        ]
        for needles, name, arguments in routes:
            if name in available and any(needle in text for needle in needles):
                return ToolCall(id=f"call_{name}", name=name, arguments=arguments)
        return None

    @staticmethod
    def _answer(messages: list[Message]) -> str:
        results = [message.content for message in messages if message.role == "tool"]
        if not results:
            return "I'm Penny. Ask me about your pantry, your meals, your grocery list or a benefits program."
        # Deliberately quotes the tool result rather than paraphrasing it, so a
        # grounding test can assert that what Penny said came from a tool.
        return "Here's what I found: " + " ".join(results)[:600]
