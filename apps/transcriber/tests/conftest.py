import pytest

from hth_transcriber.config import reset_settings
from hth_transcriber.models import TranscriptSource
from hth_transcriber.transcripts import TranscriptBundle


@pytest.fixture(autouse=True)
def clean_settings(monkeypatch):
    """Every test starts from a known environment."""
    for name in (
        "APP_ENV",
        "IMPORT_SHARED_SECRET",
        "RECIPE_AI_API_KEY",
        "IMPORT_ALLOWED_HOSTS",
        "IMPORT_MAX_DURATION_SECONDS",
    ):
        monkeypatch.delenv(name, raising=False)
    reset_settings()
    yield
    reset_settings()


@pytest.fixture
def bundle():
    return TranscriptBundle(
        text="post text\n\nspoken words",
        source=TranscriptSource.captions,
        language="en",
        used_description=True,
        platform="youtube",
        video_id="abc123",
        canonical_url="https://www.youtube.com/watch?v=abc123",
        title="Weeknight Dal",
        channel="Hive Kitchen",
        channel_url="https://www.youtube.com/@hivekitchen",
        published_at="20250114",
        duration_seconds=420,
    )
