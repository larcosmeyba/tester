"""Penny's voice, kept apart from her rules.

This package holds how she talks. penny.policy holds what she is allowed to do.
Somebody editing her warmth should not be able to change her permissions by
accident, and the split is what makes that true.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def voice() -> str:
    return (Path(__file__).parent / "penny.md").read_text(encoding="utf-8")
