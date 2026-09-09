"""Source handling: what we accept, and what we read from it."""

import pytest

from hth_transcriber.config import get_settings, reset_settings
from hth_transcriber.errors import UnsupportedSource
from hth_transcriber.transcripts import (
    check_url_allowed,
    get_caption_languages,
    get_post_text,
    is_youtube_url,
    platform_of,
)


@pytest.mark.parametrize(
    "url,expected",
    [
        ("https://www.youtube.com/watch?v=abc", True),
        ("https://youtu.be/abc", True),
        ("https://m.youtube.com/watch?v=abc", True),
        ("https://www.instagram.com/reel/abc/", False),
    ],
)
def test_is_youtube_url(url, expected):
    assert is_youtube_url(url) is expected


@pytest.mark.parametrize(
    "url,expected",
    [
        ("https://youtu.be/abc", "youtube"),
        ("https://www.instagram.com/reel/abc/", "instagram"),
        ("https://www.tiktok.com/@x/video/1", "tiktok"),
    ],
)
def test_platform_of(url, expected):
    assert platform_of(url) == expected


def test_allowed_hosts_pass():
    check_url_allowed("https://www.youtube.com/watch?v=abc")


@pytest.mark.parametrize(
    "url",
    [
        "https://evil.example.com/video",
        "http://169.254.169.254/latest/meta-data/",
        "file:///etc/passwd",
        "https://youtube.com.evil.example.com/watch?v=abc",
    ],
)
def test_everything_else_is_refused(url):
    """The service fetches what it is given, so the allowlist is the boundary."""
    with pytest.raises(UnsupportedSource):
        check_url_allowed(url)


def test_allowlist_is_configurable(monkeypatch):
    monkeypatch.setenv("IMPORT_ALLOWED_HOSTS", "videos.internal.example")
    reset_settings()

    check_url_allowed("https://videos.internal.example/x", get_settings())
    with pytest.raises(UnsupportedSource):
        check_url_allowed("https://www.youtube.com/watch?v=abc", get_settings())


def test_post_text_prefers_description_then_caption():
    assert get_post_text({"description": "d", "caption": "c"}) == "d"
    assert get_post_text({"caption": "c"}) == "c"
    assert get_post_text({}) == ""


def test_caption_languages_are_deduplicated():
    info = {
        "subtitles": {"en": [], "fr": []},
        "automatic_captions": {"en": [], "es": []},
        "language": "fr",
    }
    assert get_caption_languages(info) == ["en", "fr", "es"]


def test_caption_languages_tolerate_missing_keys():
    assert get_caption_languages({}) == []
    assert get_caption_languages({"subtitles": None, "language": "en"}) == ["en"]
