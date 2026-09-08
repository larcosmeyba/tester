"""Settings, read once at start-up.

A misconfigured Penny fails here rather than on somebody's first message. That
is the same rule the Go server applies to its own AI provider, and it exists
because a chat that starts, accepts a message and then dies is much harder to
diagnose than a process that refuses to boot.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ProviderKind = Literal["fake", "anthropic", "openai_compatible"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PENNY_", env_file=".env", extra="ignore")

    host: str = "0.0.0.0"
    port: int = 8081
    env: str = "development"
    log_level: str = "info"

    # The Help The Hive backend. Every tool call goes here.
    #
    # Note what is absent from this class: there is no database URL, no
    # connection string and no credential for any store. This process cannot
    # reach the database, by construction.
    backend_url: str = "http://localhost:8080"
    service_token: str = ""

    provider: ProviderKind = "fake"
    model: str = "claude-sonnet-5"
    api_key: str = ""
    base_url: str = ""

    # A turn's budget. The tool cap is the one that matters: it is what stops a
    # model that has decided to call the same tool forever.
    max_tool_calls: int = Field(default=8, ge=1, le=20)
    max_output_tokens: int = Field(default=800, ge=64, le=4096)
    request_timeout_seconds: float = Field(default=60.0, gt=0)

    @model_validator(mode="after")
    def check(self) -> "Settings":
        if self.provider != "fake" and not self.api_key:
            raise ValueError(f"PENNY_API_KEY is required when PENNY_PROVIDER is {self.provider}")
        if self.provider == "openai_compatible" and not self.base_url:
            raise ValueError("PENNY_BASE_URL is required when PENNY_PROVIDER is openai_compatible")
        if self.env not in {"development", "local"} and not self.service_token:
            # Without it this service would answer anyone who could reach it,
            # and would be unable to call a single tool.
            raise ValueError("PENNY_SERVICE_TOKEN is required outside development")
        return self

    @property
    def is_development(self) -> bool:
        return self.env in {"development", "local"}


@lru_cache(maxsize=1)
def settings() -> Settings:
    return Settings()
