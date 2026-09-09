"""Getting the words out of a video.

Derived from `video_transcripts.py` in sleeper/recipe-extractor (MIT), with
four changes needed to run this as a service rather than a CLI:

  * audio goes to a per-call temp directory, not a fixed `audio.mp3` in the
    working directory — two concurrent imports would otherwise overwrite each
    other's audio and transcribe the wrong video;
  * the URL host is checked against an allowlist before anything is fetched;
  * videos past the duration cap are rejected before the audio is downloaded;
  * the caller gets back the metadata and the provenance of the transcript,
    not just a concatenated string.

Order of preference is unchanged from upstream, and is the right one: real
captions beat machine transcription, and both are combined with the post
description because creators put the actual quantities in the caption far
more often than they say them out loud.
"""

from __future__ import annotations

import os
import shutil
import tempfile
from dataclasses import dataclass
from urllib.parse import urlparse

import yt_dlp

from .config import Settings, get_settings
from .errors import NoTranscript, UnsupportedSource, VideoTooLong, VideoUnavailable
from .models import TranscriptSource

try:  # pragma: no cover - optional dependency
    from youtube_transcript_api import YouTubeTranscriptApi
except Exception:  # pragma: no cover
    YouTubeTranscriptApi = None


@dataclass
class TranscriptBundle:
    """Everything an extraction needs, plus how it was obtained."""

    text: str
    source: TranscriptSource
    language: str | None
    used_description: bool
    platform: str
    video_id: str | None
    canonical_url: str
    title: str | None
    channel: str | None
    channel_url: str | None
    published_at: str | None
    duration_seconds: int | None


def host_of(url: str) -> str:
    return (urlparse(url).netloc or "").lower().split(":")[0]


def is_youtube_url(url: str) -> bool:
    host = host_of(url)
    return host.endswith("youtube.com") or host == "youtu.be"


def platform_of(url: str) -> str:
    host = host_of(url)
    if host.endswith("youtube.com") or host == "youtu.be":
        return "youtube"
    if host.endswith("instagram.com"):
        return "instagram"
    if host.endswith("tiktok.com"):
        return "tiktok"
    return host or "unknown"


def check_url_allowed(url: str, settings: Settings | None = None) -> None:
    """Reject anything not on the allowlist.

    This service fetches whatever URL it is given. Without this check a caller
    could point it at an internal address and read the response back out of
    the error message.
    """

    settings = settings or get_settings()
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise UnsupportedSource(f"Unsupported URL scheme: {parsed.scheme or 'none'}")
    host = host_of(url)
    if host not in settings.allowed_hosts:
        raise UnsupportedSource(
            f"{host or 'that host'} is not a supported video source",
            detail="Supported: YouTube, Instagram, TikTok.",
        )


def fetch_video_info(url: str) -> dict:
    """Video metadata, without downloading the media."""
    try:
        with yt_dlp.YoutubeDL({"quiet": True, "noplaylist": True}) as ydl:
            return ydl.extract_info(url, download=False)
    except Exception as e:  # yt-dlp raises a wide variety of its own types
        raise VideoUnavailable(
            "That video could not be read. It may be private, deleted or region-locked.",
            detail=str(e),
        ) from e


def download_audio(url: str, out_dir: str) -> str:
    """Download the audio track into `out_dir` and return the file path."""
    base = os.path.join(out_dir, "audio")
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": base,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ],
        "quiet": True,
        "noplaylist": True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
    except Exception as e:
        raise VideoUnavailable("The audio could not be downloaded.", detail=str(e)) from e

    path = base + ".mp3"
    if not os.path.exists(path):
        # ffmpeg names the output by extension; fall back to whatever landed.
        for name in os.listdir(out_dir):
            if name.startswith("audio"):
                return os.path.join(out_dir, name)
        raise NoTranscript("No audio track was produced for that video.")
    return path


def get_post_text(info: dict) -> str:
    """The description or caption. Often where the real quantities live."""
    for key in ("description", "caption", "summary"):
        text = info.get(key)
        if text:
            return str(text)
    return ""


def get_caption_languages(info: dict) -> list[str]:
    languages: list[str] = []
    for key in ("subtitles", "automatic_captions"):
        for lang in (info.get(key) or {}):
            if lang not in languages:
                languages.append(lang)
    if info.get("language") and info["language"] not in languages:
        languages.append(info["language"])
    return languages


def get_youtube_transcript(video_id: str | None, languages=None) -> tuple[str, str] | None:
    """Return `(text, language)` from YouTube captions, or None."""
    if not video_id or not YouTubeTranscriptApi:
        return None

    try:
        api = YouTubeTranscriptApi()
        transcript_list = api.list(video_id)
    except Exception:  # network dependent, and absence is not an error here
        return None

    def fetch_text(transcript) -> str | None:
        try:
            segments = transcript.fetch()
        except Exception:
            return None
        text = " ".join(seg.text for seg in segments).strip()
        return text or None

    for lang in list(languages or []):
        try:
            t = transcript_list.find_transcript([lang])
        except Exception:
            continue
        text = fetch_text(t)
        if text:
            return text, getattr(t, "language_code", lang)

    for t in transcript_list:
        text = fetch_text(t)
        if text:
            return text, getattr(t, "language_code", None)
    return None


def transcribe_audio(path: str, settings: Settings | None = None) -> str:
    """Speech to text, via the configured OpenAI-compatible provider."""
    from .provider import audio_client

    settings = settings or get_settings()
    with open(path, "rb") as fh:
        result = audio_client(settings).audio.transcriptions.create(
            model=settings.transcribe_model,
            file=fh,
        )
    return result.text


def build_transcript(url: str, settings: Settings | None = None) -> TranscriptBundle:
    """Fetch a video's words, preferring real captions over machine audio."""
    settings = settings or get_settings()
    check_url_allowed(url, settings)

    info = fetch_video_info(url)
    duration = info.get("duration")
    duration = int(duration) if isinstance(duration, (int, float)) else None
    if duration and duration > settings.max_duration_seconds:
        raise VideoTooLong(
            f"That video is {duration // 60} minutes long; the limit is "
            f"{settings.max_duration_seconds // 60}."
        )

    post_text = get_post_text(info)
    transcript: str | None = None
    language: str | None = info.get("language")
    source = TranscriptSource.description_only

    if is_youtube_url(url):
        found = get_youtube_transcript(info.get("id"), get_caption_languages(info))
        if found:
            transcript, language = found
            source = TranscriptSource.captions

    if not transcript:
        work_dir = tempfile.mkdtemp(prefix="hth-import-")
        try:
            audio_path = download_audio(url, work_dir)
            transcript = transcribe_audio(audio_path, settings)
            source = TranscriptSource.audio
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)

    combined = "\n\n".join(part for part in (post_text, transcript) if part).strip()
    if not combined:
        raise NoTranscript("That video has no caption, description or audible speech to read.")

    return TranscriptBundle(
        text=combined,
        source=source,
        language=language,
        used_description=bool(post_text),
        platform=platform_of(url),
        video_id=info.get("id"),
        canonical_url=info.get("webpage_url") or url,
        title=info.get("title"),
        channel=info.get("uploader") or info.get("channel"),
        channel_url=info.get("uploader_url") or info.get("channel_url"),
        published_at=info.get("upload_date"),
        duration_seconds=duration,
    )
