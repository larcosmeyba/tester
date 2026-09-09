"""Turning the model's answer into a Standard HTH Recipe Object.

This is where the contract's rule is enforced:

    A recipe line with no stated quantity keeps `quantity: null` and carries a
    `missingInformation` note. Nothing invents the number. Recipes with missing
    information stay viewable but are never planned automatically.

So this module's real job is bookkeeping about absence — recording what the
video failed to establish, and refusing to mark the recipe plannable when
anything the planner depends on is missing.
"""

from __future__ import annotations

from datetime import datetime, timezone

from .models import (
    Equipment,
    ImportedRecipe,
    IngredientLine,
    InstructionStep,
    MealType,
    SourceProvenance,
    TranscriptSource,
    ValueConfidence,
)
from .transcripts import TranscriptBundle

NO_QUANTITY_NOTE = "The video never stated a quantity for this ingredient."

# What the meal planner needs before it can put a recipe in a week. Anything
# absent here keeps the recipe viewable but unplannable.
MISSING_SERVINGS = "servings"
MISSING_QUANTITIES = "ingredient_quantities"
MISSING_INSTRUCTIONS = "instructions"
MISSING_INGREDIENTS = "ingredients"
MISSING_TIME = "total_time"


def _clean(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _positive_int(value) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _positive_float(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _enum_list(values, enum_cls) -> list:
    out = []
    for value in values or []:
        try:
            member = enum_cls(str(value).strip().lower())
        except ValueError:
            continue  # the model offered something outside the contract; drop it
        if member not in out:
            out.append(member)
    return out


def build_ingredients(raw_lines) -> tuple[list[IngredientLine], bool]:
    """Ingredient lines, plus whether any quantity was left unstated."""

    lines: list[IngredientLine] = []
    any_missing = False
    position = 0

    for raw in raw_lines or []:
        text = _clean(raw.get("rawText"))
        if not text:
            continue
        position += 1

        quantity = _positive_float(raw.get("quantity"))
        is_to_taste = bool(raw.get("isToTaste"))

        # "A pinch of salt" is not missing information — the recipe is complete
        # without a number. "Some chicken" is.
        note = None
        if quantity is None and not is_to_taste:
            note = NO_QUANTITY_NOTE
            any_missing = True

        lines.append(
            IngredientLine(
                position=position,
                raw_text=text,
                display_name=_clean(raw.get("displayName")),
                quantity=quantity,
                unit=_clean(raw.get("unit")),
                preparation=_clean(raw.get("preparation")),
                # Grams are the server's to compute: it owns the ingredient
                # catalogue that knows what a cup of flour weighs.
                grams=None,
                is_optional=bool(raw.get("isOptional")),
                is_to_taste=is_to_taste,
                missing_information=note,
            )
        )

    return lines, any_missing


def build_instructions(raw_steps) -> list[InstructionStep]:
    steps: list[InstructionStep] = []
    number = 0
    for raw in raw_steps or []:
        text = _clean(raw.get("text"))
        if not text:
            continue
        number += 1
        steps.append(
            InstructionStep(step=number, text=text, minutes=_positive_int(raw.get("minutes")))
        )
    return steps


def compose_description(description: str | None, tips: list[str] | None) -> str | None:
    """Keep the video's tips.

    The Recipe object has no `tips` field, and adding one would fork the
    contract. Tips the cook actually gave are worth keeping, so they go into
    the description under a heading rather than being thrown away or promoted
    into instructions they are not.
    """

    parts = []
    if _clean(description):
        parts.append(_clean(description))
    kept = [t for t in (_clean(tip) for tip in tips or []) if t]
    if kept:
        parts.append("Tips from the video:\n" + "\n".join(f"- {tip}" for tip in kept))
    return "\n\n".join(parts) if parts else None


def attribution_for(bundle: TranscriptBundle) -> str:
    """Say where this came from, in a line a user can read.

    Imports are somebody else's work. The attribution travels with the recipe
    so it is present wherever the recipe is shown.
    """

    title = bundle.title or "a video"
    if bundle.channel:
        return f'Adapted from "{title}" by {bundle.channel} — {bundle.canonical_url}'
    return f'Adapted from "{title}" — {bundle.canonical_url}'


def build_provenance(bundle: TranscriptBundle, model: str | None) -> SourceProvenance:
    published = bundle.published_at
    if published and len(published) == 8 and published.isdigit():
        published = f"{published[:4]}-{published[4:6]}-{published[6:]}"

    return SourceProvenance(
        platform=bundle.platform,
        video_id=bundle.video_id,
        canonical_url=bundle.canonical_url,
        channel=bundle.channel,
        channel_url=bundle.channel_url,
        published_at=published,
        duration_seconds=bundle.duration_seconds,
        transcript_source=TranscriptSource(bundle.source),
        transcript_language=bundle.language,
        used_description=bundle.used_description,
        model=model,
        extracted_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
    )


def normalize(
    raw: dict,
    bundle: TranscriptBundle,
    *,
    model: str | None = None,
) -> ImportedRecipe:
    """Assemble the recipe, and record everything the video left unsaid."""

    ingredients, quantities_missing = build_ingredients(raw.get("ingredients"))
    instructions = build_instructions(raw.get("instructions"))

    servings = _positive_float(raw.get("servings"))
    prep = _positive_int(raw.get("prepTimeMinutes"))
    cook = _positive_int(raw.get("cookTimeMinutes"))
    total = _positive_int(raw.get("totalTimeMinutes"))
    if total is None and (prep or cook):
        # A sum of two stated numbers is arithmetic, not a guess.
        total = (prep or 0) + (cook or 0)

    missing: list[str] = []
    if not ingredients:
        missing.append(MISSING_INGREDIENTS)
    if not instructions:
        missing.append(MISSING_INSTRUCTIONS)
    if servings is None:
        missing.append(MISSING_SERVINGS)
    if quantities_missing:
        missing.append(MISSING_QUANTITIES)
    if total is None:
        missing.append(MISSING_TIME)

    difficulty = _positive_int(raw.get("difficulty"))
    if difficulty is not None and not 1 <= difficulty <= 5:
        difficulty = None

    return ImportedRecipe(
        title=_clean(raw.get("title")) or bundle.title or "Imported recipe",
        description=compose_description(raw.get("description"), raw.get("tips")),
        source_type="video_import",
        source_url=bundle.canonical_url,
        source_name=bundle.channel,
        attribution_text=attribution_for(bundle),
        # An import is a proposal to the person who asked for it. It is never
        # library content and never public, whatever the caller asks for.
        visibility="private",
        review_status="draft",
        servings=servings,
        servings_confidence=(
            ValueConfidence.source if servings is not None else ValueConfidence.missing
        ),
        serving_size_text=_clean(raw.get("servingSizeText")),
        scalable=True,
        prep_time_minutes=prep,
        cook_time_minutes=cook,
        total_time_minutes=total,
        time_confidence=(
            ValueConfidence.source if total is not None else ValueConfidence.missing
        ),
        meal_types=_enum_list(raw.get("mealTypes"), MealType),
        cuisine=_clean(raw.get("cuisine")),
        difficulty=difficulty,
        equipment_required=_enum_list(raw.get("equipmentRequired"), Equipment),
        is_component=False,
        tags=[t for t in (_clean(tag) for tag in raw.get("tags") or []) if t],
        ingredients=ingredients,
        instructions=instructions,
        # Never estimated here. A video that does not state nutrition produces
        # no nutrition, and the server decides what to do about that.
        nutrition=None,
        base_meal_plan_eligible=not missing,
        missing_information=missing,
        provenance=build_provenance(bundle, model),
    )
