"""Which provider answers, decided once at start-up."""

from __future__ import annotations

from penny.config import Settings
from penny.providers.base import Provider
from penny.providers.fake import FakeProvider


def build(settings: Settings) -> Provider:
    if settings.provider == "fake":
        return FakeProvider(model=settings.model or "fake-1")

    if settings.provider == "anthropic":
        from penny.providers.anthropic import AnthropicProvider

        return AnthropicProvider(
            api_key=settings.api_key,
            model=settings.model,
            timeout=settings.request_timeout_seconds,
        )

    if settings.provider == "openai_compatible":
        from penny.providers.openai_compatible import OpenAICompatibleProvider

        return OpenAICompatibleProvider(
            api_key=settings.api_key,
            base_url=settings.base_url,
            model=settings.model,
            timeout=settings.request_timeout_seconds,
        )

    raise ValueError(f"unknown provider {settings.provider!r}")
