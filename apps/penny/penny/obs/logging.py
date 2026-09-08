"""Structured logs, with the turn attached to every line.

A conversation that went wrong is debugged by turn id, so the turn id is on
every line rather than on the first one. What is deliberately not on any line is
the conversation: message text is logged as a redacted preview, never in full.
A log that holds complete transcripts is a second copy of the conversation
store with none of its access controls.
"""

from __future__ import annotations

import logging
import sys

import structlog


def configure(level: str = "info") -> None:
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level.upper())
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, level.upper(), logging.INFO)
        ),
        cache_logger_on_first_use=True,
    )


def logger() -> structlog.stdlib.BoundLogger:
    return structlog.get_logger("penny")


def bind_turn(turn_id: str, conversation_id: str) -> None:
    """Attaches the turn to everything logged for the rest of this request."""
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(turn=turn_id, conversation=conversation_id)
