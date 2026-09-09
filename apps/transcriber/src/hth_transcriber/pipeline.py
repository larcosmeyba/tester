"""The import, end to end: a link in, a Standard HTH Recipe Object out."""

from __future__ import annotations

from collections.abc import Callable

from .config import Settings, get_settings
from .extract import extract_recipe_fields
from .models import ImportedRecipe
from .normalize import normalize
from .transcripts import build_transcript

ProgressFn = Callable[[str], None]


def import_recipe(
    url: str,
    language: str = "english",
    settings: Settings | None = None,
    on_progress: ProgressFn | None = None,
) -> ImportedRecipe:
    """Fetch, transcribe, extract, normalize.

    Raises the named errors in `errors.py`; every one of them is a condition
    the caller can report to a user in words.
    """

    settings = settings or get_settings()

    def progress(stage: str) -> None:
        if on_progress:
            on_progress(stage)

    progress("fetching_transcript")
    bundle = build_transcript(url, settings)

    progress("extracting_recipe")
    raw = extract_recipe_fields(bundle.text, language, settings)

    progress("normalizing")
    return normalize(raw, bundle, model=settings.ai_model)
