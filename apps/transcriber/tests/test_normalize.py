"""The rule this service exists to honour: nothing invents a number.

These tests are the real specification of the import. Each one pins a case
where a video leaves something unsaid and the recipe has to say so rather
than fill it in.
"""

from hth_transcriber.models import ValueConfidence
from hth_transcriber.normalize import (
    MISSING_QUANTITIES,
    MISSING_SERVINGS,
    MISSING_TIME,
    NO_QUANTITY_NOTE,
    normalize,
)

COMPLETE = {
    "isRecipe": True,
    "title": "Weeknight Dal",
    "description": "A fast lentil dal.",
    "servings": 4,
    "servingSizeText": None,
    "prepTimeMinutes": 10,
    "cookTimeMinutes": 20,
    "totalTimeMinutes": 30,
    "mealTypes": ["dinner"],
    "cuisine": "Indian",
    "difficulty": 2,
    "equipmentRequired": ["stovetop"],
    "tags": ["one_pot"],
    "ingredients": [
        {
            "rawText": "200g red lentils",
            "displayName": "red lentils",
            "quantity": 200,
            "unit": "g",
            "preparation": "rinsed",
            "isOptional": False,
            "isToTaste": False,
        }
    ],
    "instructions": [{"text": "Simmer the lentils.", "minutes": 20}],
    "tips": [],
}


def _with(**overrides):
    return {**COMPLETE, **overrides}


def test_complete_recipe_is_plannable(bundle):
    recipe = normalize(COMPLETE, bundle)

    assert recipe.missing_information == []
    assert recipe.base_meal_plan_eligible is True
    assert recipe.servings_confidence == ValueConfidence.source
    assert recipe.time_confidence == ValueConfidence.source


def test_unstated_servings_are_recorded_not_guessed(bundle):
    recipe = normalize(_with(servings=None), bundle)

    assert recipe.servings is None
    assert recipe.servings_confidence == ValueConfidence.missing
    assert MISSING_SERVINGS in recipe.missing_information
    assert recipe.base_meal_plan_eligible is False


def test_unstated_quantity_annotates_the_line(bundle):
    raw = _with(
        ingredients=[
            {
                "rawText": "a handful of coriander",
                "displayName": "coriander",
                "quantity": None,
                "unit": None,
                "preparation": None,
                "isOptional": False,
                "isToTaste": False,
            }
        ]
    )
    recipe = normalize(raw, bundle)

    line = recipe.ingredients[0]
    assert line.quantity is None
    assert line.missing_information == NO_QUANTITY_NOTE
    assert MISSING_QUANTITIES in recipe.missing_information
    assert recipe.base_meal_plan_eligible is False


def test_to_taste_is_complete_without_a_quantity(bundle):
    """"Salt to taste" is a finished instruction, not a gap."""
    raw = _with(
        ingredients=[
            {
                "rawText": "salt to taste",
                "displayName": "salt",
                "quantity": None,
                "unit": None,
                "preparation": None,
                "isOptional": False,
                "isToTaste": True,
            }
        ]
    )
    recipe = normalize(raw, bundle)

    assert recipe.ingredients[0].missing_information is None
    assert MISSING_QUANTITIES not in recipe.missing_information
    assert recipe.base_meal_plan_eligible is True


def test_total_time_is_summed_from_stated_parts_only(bundle):
    recipe = normalize(_with(totalTimeMinutes=None), bundle)
    assert recipe.total_time_minutes == 30  # 10 prep + 20 cook, both stated

    nothing_stated = normalize(
        _with(prepTimeMinutes=None, cookTimeMinutes=None, totalTimeMinutes=None), bundle
    )
    assert nothing_stated.total_time_minutes is None
    assert nothing_stated.time_confidence == ValueConfidence.missing
    assert MISSING_TIME in nothing_stated.missing_information


def test_imports_are_always_private_drafts(bundle):
    recipe = normalize(COMPLETE, bundle)

    assert recipe.visibility == "private"
    assert recipe.review_status == "draft"
    assert recipe.source_type == "video_import"
    assert recipe.source_url == bundle.canonical_url


def test_attribution_names_the_creator(bundle):
    recipe = normalize(COMPLETE, bundle)

    assert "Hive Kitchen" in recipe.attribution_text
    assert "Weeknight Dal" in recipe.attribution_text
    assert bundle.canonical_url in recipe.attribution_text
    assert recipe.source_name == "Hive Kitchen"


def test_tips_are_kept_in_the_description(bundle):
    recipe = normalize(_with(tips=["Toast the spices first."]), bundle)

    assert "Toast the spices first." in recipe.description
    assert "A fast lentil dal." in recipe.description


def test_nutrition_is_never_estimated(bundle):
    assert normalize(COMPLETE, bundle).nutrition is None


def test_grams_are_left_for_the_server(bundle):
    """The server owns the ingredient catalogue, so it owns gram conversion."""
    assert normalize(COMPLETE, bundle).ingredients[0].grams is None


def test_values_outside_the_contract_are_dropped(bundle):
    raw = _with(mealTypes=["dinner", "brunch"], equipmentRequired=["stovetop", "sous_vide"])
    recipe = normalize(raw, bundle)

    assert recipe.meal_types == ["dinner"]
    assert recipe.equipment_required == ["stovetop"]


def test_difficulty_outside_one_to_five_is_dropped(bundle):
    assert normalize(_with(difficulty=9), bundle).difficulty is None
    assert normalize(_with(difficulty=3), bundle).difficulty == 3


def test_ingredient_positions_are_contiguous(bundle):
    raw = _with(
        ingredients=[
            {"rawText": "a", "quantity": 1, "unit": "g", "isOptional": False, "isToTaste": False},
            {"rawText": "   ", "quantity": 1, "unit": "g", "isOptional": False, "isToTaste": False},
            {"rawText": "c", "quantity": 1, "unit": "g", "isOptional": False, "isToTaste": False},
        ]
    )
    recipe = normalize(raw, bundle)

    assert [line.position for line in recipe.ingredients] == [1, 2]


def test_provenance_records_how_the_words_were_obtained(bundle):
    recipe = normalize(COMPLETE, bundle, model="gpt-4o-mini")

    assert recipe.provenance.transcript_source == "captions"
    assert recipe.provenance.video_id == "abc123"
    assert recipe.provenance.published_at == "2025-01-14"
    assert recipe.provenance.model == "gpt-4o-mini"
