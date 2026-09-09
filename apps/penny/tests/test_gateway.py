"""The client for the tool gateway.

These tests are about how the agent reacts to the server's answers — in
particular, that a denial and a failure are not the same thing to the model.
"""

from __future__ import annotations

import httpx
import pytest
import respx

from penny.tools.gateway import ToolGateway, ToolOutcome

BACKEND = "http://backend.test"


@pytest.fixture
def gateway() -> ToolGateway:
    return ToolGateway(base_url=BACKEND, service_token="service-token", timeout=5.0)


@respx.mock
async def test_call_sends_the_turn_token_and_nothing_else(gateway: ToolGateway):
    route = respx.post(f"{BACKEND}/internal/penny/tools").mock(
        return_value=httpx.Response(200, json={"tool": "pantry.list", "result": []})
    )

    await gateway.call("token-1", "turn-1", "pantry.list", {"location": "REFRIGERATOR"})

    request = route.calls[0].request
    body = request.read().decode()

    assert request.headers["Authorization"] == "Bearer service-token"
    assert "token-1" in body
    assert "turn-1" in body
    # The agent has no user identity to send, and must never invent one.
    assert "user_id" not in body


@respx.mock
async def test_denied_calls_are_marked_as_denied(gateway: ToolGateway):
    respx.post(f"{BACKEND}/internal/penny/tools").mock(
        return_value=httpx.Response(
            200, json={"tool": "budget.set_weekly", "denied": True, "error": "not available"}
        )
    )

    outcome = await gateway.call("token-1", "turn-1", "budget.set_weekly", {"amount": 50})

    assert outcome.denied
    assert not outcome.ok
    # The wording matters: the model must not go looking for another route.
    assert "DENIED" in outcome.for_model()
    assert "another way" in outcome.for_model()


@respx.mock
async def test_proposals_tell_the_model_nothing_happened(gateway: ToolGateway):
    respx.post(f"{BACKEND}/internal/penny/tools").mock(
        return_value=httpx.Response(
            200,
            json={
                "tool": "mealplan.generate",
                "proposed": {"id": "action-1", "summary": "Build a new 7-day meal plan."},
            },
        )
    )

    outcome = await gateway.call("token-1", "turn-1", "mealplan.generate", {"days": 7})

    assert outcome.proposed is not None
    rendered = outcome.for_model()
    assert "NOT DONE YET" in rendered
    assert "Build a new 7-day meal plan." in rendered


@respx.mock
async def test_an_expired_token_is_a_denial_not_a_retry(gateway: ToolGateway):
    respx.post(f"{BACKEND}/internal/penny/tools").mock(return_value=httpx.Response(401))

    outcome = await gateway.call("stale", "turn-1", "pantry.list", {})

    assert outcome.denied


@respx.mock
async def test_an_unreachable_backend_fails_without_leaking(gateway: ToolGateway):
    respx.post(f"{BACKEND}/internal/penny/tools").mock(side_effect=httpx.ConnectError("boom"))

    outcome = await gateway.call("token-1", "turn-1", "pantry.list", {})

    assert not outcome.ok
    assert not outcome.denied
    assert "boom" not in outcome.for_model()


def test_large_results_are_truncated():
    outcome = ToolOutcome(tool="pantry.list", result=[{"name": "x" * 100} for _ in range(200)])
    assert len(outcome.for_model()) < 4100
