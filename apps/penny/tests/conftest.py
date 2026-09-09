from __future__ import annotations

import pytest

from penny.api.schemas import ToolDescriptor, TurnRequest, TurnUser


@pytest.fixture
def tool_descriptors() -> list[ToolDescriptor]:
    """The tools the Go router would grant a pantry question."""
    return [
        ToolDescriptor(
            Name="pantry.list",
            Scope="pantry",
            Risk="read",
            Description="What the user has in their pantry, fridge and freezer right now.",
            Arguments=["location"],
        ),
        ToolDescriptor(
            Name="pantry.expiring",
            Scope="pantry",
            Risk="read",
            Description="Pantry items expiring within the given number of days.",
            Arguments=["within_days"],
        ),
        ToolDescriptor(
            Name="mealplan.generate",
            Scope="mealplan",
            Risk="confirm",
            Description="Build the user a meal plan for the week.",
            Arguments=["days", "meals_per_day", "budget", "use_pantry_first"],
        ),
    ]


@pytest.fixture
def turn_request(tool_descriptors) -> TurnRequest:
    return TurnRequest(
        turn_id="turn-1",
        conversation_id="conv-1",
        tool_token="token-1",
        user=TurnUser(first_name="Sam", jurisdiction="US-OH"),
        input="what's expiring in my fridge?",
        scopes=["pantry", "profile", "memory", "knowledge"],
        tools=tool_descriptors,
    )
