"""The AI provider.

A base URL plus a model name, exactly as `MEAL_AI_*` does on the Go server,
so moving off OpenAI is configuration rather than a code change. Any
OpenAI-compatible endpoint works.
"""

from __future__ import annotations

from functools import lru_cache

from openai import OpenAI

from .config import Settings


@lru_cache(maxsize=4)
def _client(base_url: str, api_key: str) -> OpenAI:
    return OpenAI(base_url=base_url, api_key=api_key)


def chat_client(settings: Settings) -> OpenAI:
    return _client(settings.ai_base_url, settings.ai_api_key)


def audio_client(settings: Settings) -> OpenAI:
    return _client(settings.ai_base_url, settings.ai_api_key)
