"""The extraction contract: a strict schema and rules that forbid guessing."""

import json

from hth_transcriber.extract import RULES, build_prompt, response_schema


def test_schema_is_strict_everywhere():
    """Structured outputs only hold if every object is closed and required."""

    def check(node):
        if not isinstance(node, dict):
            return
        if node.get("type") == "object":
            assert node.get("additionalProperties") is False
            assert set(node.get("required", [])) == set(node.get("properties", {}))
        for value in node.values():
            if isinstance(value, dict):
                check(value)
            elif isinstance(value, list):
                for item in value:
                    check(item)

    check(response_schema())


def test_optional_values_are_nullable_rather_than_absent():
    """A value the video never stated must be expressible as null."""
    props = response_schema()["properties"]

    for field in ("servings", "prepTimeMinutes", "cuisine", "totalTimeMinutes"):
        assert "null" in props[field]["type"], field

    line = props["ingredients"]["items"]["properties"]
    assert "null" in line["quantity"]["type"]
    assert "null" in line["unit"]["type"]


def test_schema_enums_match_the_graphql_contract():
    props = response_schema()["properties"]

    assert props["mealTypes"]["items"]["enum"] == [
        "breakfast",
        "lunch",
        "dinner",
        "snack",
        "dessert",
        "side",
    ]
    assert "air_fryer" in props["equipmentRequired"]["items"]["enum"]


def test_schema_is_serialisable():
    json.dumps(response_schema())


def test_rules_forbid_inventing_quantities():
    # Flattened so the assertions survive the prompt being re-wrapped.
    flat = " ".join(RULES.split())

    assert "salt, pepper, oil" in flat
    assert "`quantity` MUST be null" in flat
    assert "Do NOT convert a vague phrase into a number" in flat
    assert "When in doubt, leave it out" in flat


def test_prompt_carries_the_transcript_and_language():
    prompt = build_prompt("chop the onion", "french")

    assert "chop the onion" in prompt
    assert "French" in prompt
    assert "Do not translate" in prompt
