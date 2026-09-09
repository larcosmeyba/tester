"""Turning a transcript into a recipe.

The anti-hallucination rules come from sleeper/recipe-extractor and are the
best part of it. They are extended here for the fields Help The Hive needs,
because the failure the upstream prompt guards against — inventing salt,
pepper and oil that nobody mentioned — has an exact analogue in every
quantity, time and serving count a video never states.

The rule throughout: a value the video did not establish comes back null.
`normalize.py` then records *why* it is null. Nothing is guessed.
"""

from __future__ import annotations

import json

from .config import Settings, get_settings
from .errors import NotACooking, ProviderError
from .provider import chat_client

MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "dessert", "side"]
EQUIPMENT = [
    "stovetop",
    "oven",
    "microwave",
    "grill",
    "blender",
    "air_fryer",
    "slow_cooker",
    "instant_pot",
]

SYSTEM_MESSAGE = (
    "You are a careful recipe archivist. You transcribe what a cook actually "
    "said and did. You never fill gaps with what a recipe usually contains."
)

RULES = """
You are extracting a recipe from the description and transcript of a cooking
video. Follow these rules STRICTLY.

1. INGREDIENTS. Extract only ingredients explicitly mentioned in the text. Do
   NOT add common ingredients — salt, pepper, oil, water, butter, rice — unless
   they are actually mentioned.
2. QUANTITIES. Set `quantity` and `unit` only when the text states them. If the
   cook says "a splash of olive oil" or never says how much, `quantity` MUST be
   null. Do NOT convert a vague phrase into a number. Set `isToTaste` true for
   "to taste", "a pinch", "season as you like".
3. STEPS. Only the steps described in the video, in the order performed. Set
   `minutes` on a step only when a duration is stated.
4. SERVINGS. Only when the speaker or caption states a number of servings or a
   yield. Otherwise null.
5. TIMES. Only when stated. Do not estimate a prep or cook time from the steps.
6. MEAL TYPES, CUISINE, EQUIPMENT, TAGS. Only what the video makes explicit or
   what is unambiguous from the ingredients and method actually shown. Equipment
   counts as shown when a step requires it — "put it in the oven" means oven.
7. TIPS. Only specific tips the speaker gives. No general cooking knowledge.
8. NUTRITION. Never estimate it. It is not part of this extraction.
9. If the text is not a cooking video at all, set `isRecipe` to false and leave
   the other fields empty.

CRITICAL: if you add any ingredient, quantity, step, time or serving count that
is not explicitly stated in the text, that is an error. When in doubt, leave it
out and let the value be null. A null is useful. A guess is not.
""".strip()


def _nullable(*types: str) -> dict:
    return {"type": [*types, "null"]}


def response_schema() -> dict:
    """Strict JSON schema. Mirrors the Standard HTH Recipe Object."""

    ingredient = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "rawText": {"type": "string", "description": "The line as the video expressed it."},
            "displayName": _nullable("string"),
            "quantity": _nullable("number"),
            "unit": _nullable("string"),
            "preparation": _nullable("string"),
            "isOptional": {"type": "boolean"},
            "isToTaste": {"type": "boolean"},
        },
        "required": [
            "rawText",
            "displayName",
            "quantity",
            "unit",
            "preparation",
            "isOptional",
            "isToTaste",
        ],
    }

    instruction = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "text": {"type": "string"},
            "minutes": _nullable("integer"),
        },
        "required": ["text", "minutes"],
    }

    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "isRecipe": {"type": "boolean"},
            "title": {"type": "string"},
            "description": _nullable("string"),
            "servings": _nullable("number"),
            "servingSizeText": _nullable("string"),
            "prepTimeMinutes": _nullable("integer"),
            "cookTimeMinutes": _nullable("integer"),
            "totalTimeMinutes": _nullable("integer"),
            "mealTypes": {"type": "array", "items": {"type": "string", "enum": MEAL_TYPES}},
            "cuisine": _nullable("string"),
            "difficulty": _nullable("integer"),
            "equipmentRequired": {"type": "array", "items": {"type": "string", "enum": EQUIPMENT}},
            "tags": {"type": "array", "items": {"type": "string"}},
            "ingredients": {"type": "array", "items": ingredient},
            "instructions": {"type": "array", "items": instruction},
            "tips": {"type": "array", "items": {"type": "string"}},
        },
        "required": [
            "isRecipe",
            "title",
            "description",
            "servings",
            "servingSizeText",
            "prepTimeMinutes",
            "cookTimeMinutes",
            "totalTimeMinutes",
            "mealTypes",
            "cuisine",
            "difficulty",
            "equipmentRequired",
            "tags",
            "ingredients",
            "instructions",
            "tips",
        ],
    }


def build_prompt(transcript: str, language: str = "english") -> str:
    language_name = {"english": "English", "french": "French"}.get(
        language.lower(), language.title()
    )
    return (
        f"{RULES}\n\n"
        f"Text from the video:\n\"\"\"{transcript}\"\"\"\n\n"
        f"Write every text value — title, ingredient lines, steps, tips — in "
        f"{language_name}, whatever language the video is in. Do not translate "
        f"quantities into different units while doing so."
    )


def extract_recipe_fields(
    transcript: str,
    language: str = "english",
    settings: Settings | None = None,
) -> dict:
    """Ask the model for the recipe. Returns the raw parsed object."""

    settings = settings or get_settings()
    if not settings.ai_configured:
        raise ProviderError("RECIPE_AI_API_KEY is not set; the import service cannot extract.")

    try:
        response = chat_client(settings).chat.completions.create(
            model=settings.ai_model,
            messages=[
                {"role": "system", "content": SYSTEM_MESSAGE},
                {"role": "user", "content": build_prompt(transcript, language)},
            ],
            temperature=0.2,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "hth_recipe_extraction",
                    "strict": True,
                    "schema": response_schema(),
                },
            },
        )
    except Exception as e:
        raise ProviderError("The extraction provider failed.", detail=str(e)) from e

    content = response.choices[0].message.content
    try:
        parsed = json.loads(content)
    except (TypeError, json.JSONDecodeError) as e:
        raise ProviderError("The provider returned something that was not JSON.") from e

    if not parsed.get("isRecipe", True):
        raise NotACooking("That video does not appear to contain a recipe.")

    return parsed
