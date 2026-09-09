"""Keeping the things that must not be logged out of the logs.

Penny's conversations are about money, food, health and government benefits.
That means a transcript can contain a Social Security number somebody typed
into the wrong box, and a log line is the easiest place in a system for one to
end up somewhere it should not be.
"""

from __future__ import annotations

import re

# Ordered most specific first: an SSN also matches the phone pattern's shape in
# some formattings, and labelling it as a phone number would be worse.
_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[ssn]"),
    (re.compile(r"\b(?:\d[ -]?){13,19}\b"), "[card]"),
    (re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.]+\b"), "[email]"),
    (re.compile(r"\b(?:\+1[ -]?)?\(?\d{3}\)?[ -]\d{3}[ -]\d{4}\b"), "[phone]"),
]


def redact(text: str) -> str:
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def preview(text: str, limit: int = 120) -> str:
    """A redacted, truncated fragment, for a log line that needs one.

    Never the whole message. A log that holds complete transcripts is a second
    copy of the conversation store with none of its access controls.
    """
    return redact(text)[:limit]
