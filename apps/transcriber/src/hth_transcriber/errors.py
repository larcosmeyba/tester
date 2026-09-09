"""Failure modes an import can have.

Every one of these is something the caller can act on, so they are named
rather than collapsed into a generic 500. `code` is what crosses the wire;
the Go server maps it onto a GraphQL error.
"""

from __future__ import annotations


class ImportError_(Exception):
    """Base class. Named with a trailing underscore to leave the builtin alone."""

    code = "IMPORT_FAILED"
    http_status = 500

    def __init__(self, message: str, *, detail: str | None = None):
        super().__init__(message)
        self.message = message
        self.detail = detail

    def as_dict(self) -> dict:
        payload = {"code": self.code, "message": self.message}
        if self.detail:
            payload["detail"] = self.detail
        return payload


class UnsupportedSource(ImportError_):
    """The URL is not a host we import from."""

    code = "UNSUPPORTED_SOURCE"
    http_status = 422


class VideoUnavailable(ImportError_):
    """The video is private, deleted, region-locked or age-gated."""

    code = "VIDEO_UNAVAILABLE"
    http_status = 422


class VideoTooLong(ImportError_):
    """Past the duration cap. Transcribing an hour of audio is not free."""

    code = "VIDEO_TOO_LONG"
    http_status = 422


class NoTranscript(ImportError_):
    """No captions and no usable audio, so there is nothing to extract from."""

    code = "NO_TRANSCRIPT"
    http_status = 422


class NotACooking(ImportError_):
    """The model found no recipe in the transcript."""

    code = "NO_RECIPE_FOUND"
    http_status = 422


class ProviderError(ImportError_):
    """The AI provider failed or returned something unparseable."""

    code = "PROVIDER_ERROR"
    http_status = 502
