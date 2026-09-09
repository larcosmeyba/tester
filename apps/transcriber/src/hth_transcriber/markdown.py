"""Recipe to Markdown.

Carried over from sleeper/recipe-extractor's `convert_to_markdown`, reshaped
for the HTH recipe object. Used by the CLI, and useful for eyeballing an
import without reading JSON.

Where a value is missing it says so, rather than printing an empty heading —
the absence is the interesting part of an import.
"""

from __future__ import annotations

from .models import ImportedRecipe

HEADINGS = {
    "english": {
        "servings": "Servings",
        "time": "Time",
        "ingredients": "Ingredients",
        "instructions": "Instructions",
        "source": "Source",
        "missing": "Not stated in the video",
        "unknown": "not stated",
        "minutes": "minutes",
    },
    "french": {
        "servings": "Portions",
        "time": "Temps",
        "ingredients": "Ingrédients",
        "instructions": "Instructions",
        "source": "Source",
        "missing": "Non précisé dans la vidéo",
        "unknown": "non précisé",
        "minutes": "minutes",
    },
}

MISSING_LABELS = {
    "servings": "how many it serves",
    "ingredient_quantities": "some ingredient quantities",
    "instructions": "the steps",
    "ingredients": "the ingredients",
    "total_time": "how long it takes",
}


def to_markdown(recipe: ImportedRecipe, language: str = "english") -> str:
    labels = HEADINGS.get(language.lower(), HEADINGS["english"])
    out = [f"# {recipe.title}", ""]

    if recipe.description:
        out += [recipe.description, ""]

    servings = recipe.servings if recipe.servings is not None else labels["unknown"]
    out.append(f"**{labels['servings']}:** {servings}")
    total = recipe.total_time_minutes
    time_text = f"{total} {labels['minutes']}" if total else labels["unknown"]
    out += [f"**{labels['time']}:** {time_text}", ""]

    out.append(f"## {labels['ingredients']}")
    for line in recipe.ingredients:
        out.append(f"- {line.raw_text}" + ("  _(?)_" if line.missing_information else ""))
    out.append("")

    out.append(f"## {labels['instructions']}")
    for step in recipe.instructions:
        suffix = f" _({step.minutes} {labels['minutes']})_" if step.minutes else ""
        out.append(f"{step.step}. {step.text}{suffix}")
    out.append("")

    if recipe.missing_information:
        out.append(f"## {labels['missing']}")
        for item in recipe.missing_information:
            out.append(f"- {MISSING_LABELS.get(item, item)}")
        out.append("")

    if recipe.attribution_text:
        out += [f"## {labels['source']}", recipe.attribution_text, ""]

    return "\n".join(out)
