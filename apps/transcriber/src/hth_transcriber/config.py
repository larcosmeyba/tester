"""Configuration.

Follows the convention already used by `MEAL_AI_*` on the Go server: a
provider is a base URL plus a model name, so switching vendors is
configuration rather than a code change.

Every value here is a server secret or a server-side limit. None of it may
ever appear in an `EXPO_PUBLIC_*` variable — anyone who installs the mobile
app can read that bundle.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()

# Hosts we accept video links from. This is an allowlist, not a blocklist:
# the service fetches whatever URL it is handed, so an open one would make it
# a request proxy into any network it can reach.
DEFAULT_ALLOWED_HOSTS = (
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "instagram.com",
    "www.instagram.com",
    "tiktok.com",
    "www.tiktok.com",
    "vm.tiktok.com",
)


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _list_env(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    raw = os.getenv(name)
    if not raw:
        return default
    return tuple(h.strip().lower() for h in raw.split(",") if h.strip())


@dataclass(frozen=True)
class Settings:
    app_env: str = field(default_factory=lambda: os.getenv("APP_ENV", "development"))
    http_host: str = field(default_factory=lambda: os.getenv("HTTP_HOST", "0.0.0.0"))
    http_port: int = field(default_factory=lambda: _int_env("PORT", 8090))

    # The recipe-extraction model.
    ai_base_url: str = field(
        default_factory=lambda: os.getenv("RECIPE_AI_BASE_URL", "https://api.openai.com/v1")
    )
    ai_model: str = field(default_factory=lambda: os.getenv("RECIPE_AI_MODEL", "gpt-4o-mini"))
    ai_api_key: str = field(default_factory=lambda: os.getenv("RECIPE_AI_API_KEY", ""))

    # The speech-to-text model, used only when a video has no usable captions.
    transcribe_model: str = field(
        default_factory=lambda: os.getenv("RECIPE_TRANSCRIBE_MODEL", "gpt-4o-mini-transcribe")
    )

    # Service-to-service auth. The Go API server is the only intended caller.
    shared_secret: str = field(default_factory=lambda: os.getenv("IMPORT_SHARED_SECRET", ""))

    allowed_hosts: tuple[str, ...] = field(
        default_factory=lambda: _list_env("IMPORT_ALLOWED_HOSTS", DEFAULT_ALLOWED_HOSTS)
    )
    max_duration_seconds: int = field(
        default_factory=lambda: _int_env("IMPORT_MAX_DURATION_SECONDS", 3600)
    )
    job_ttl_seconds: int = field(default_factory=lambda: _int_env("IMPORT_JOB_TTL_SECONDS", 3600))
    max_concurrent_imports: int = field(
        default_factory=lambda: _int_env("IMPORT_MAX_CONCURRENCY", 4)
    )

    @property
    def ai_configured(self) -> bool:
        return bool(self.ai_api_key)

    @property
    def auth_required(self) -> bool:
        """Production must not run open. Development may, for convenience."""
        return bool(self.shared_secret) or self.app_env == "production"


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def reset_settings() -> None:
    """Drop the cached settings. Tests use this after changing the environment."""
    global _settings
    _settings = None
