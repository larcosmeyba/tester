"""A turn, end to end, against the fake provider and a stubbed backend."""

from __future__ import annotations

from contextlib import asynccontextmanager

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from penny.config import Settings
from penny.graph.graph import build
from penny.main import create_app
from penny.providers.fake import FakeProvider
from penny.tools.gateway import ToolGateway

BACKEND = "http://backend.test"


@pytest.fixture
def client(monkeypatch) -> TestClient:
    settings = Settings(
        env="development",
        provider="fake",
        backend_url=BACKEND,
        service_token="",
        max_tool_calls=4,
    )

    app = create_app()

    @asynccontextmanager
    async def lifespan_override(app_):
        provider = FakeProvider()
        gateway = ToolGateway(BACKEND, "service-token", 5.0)
        app_.state.settings = settings
        app_.state.provider = provider
        app_.state.gateway = gateway
        app_.state.graph = build(provider, gateway, settings.max_tool_calls, 500)
        yield
        await gateway.aclose()

    app.router.lifespan_context = lifespan_override
    # The context manager runs the lifespan. Without it the app has no
    # settings, provider or graph, and every request fails. Newer Starlette
    # versions do not run lifespan for a bare TestClient(app).
    with TestClient(app) as test_client:
        yield test_client


def test_health_reports_no_database_access(client: TestClient):
    body = client.get("/health/detailed").json()

    # The property the architecture rests on, checkable from outside.
    assert body["database_access"] is False
    assert "api_key" not in body
    assert "service_token" not in body


@respx.mock
def test_a_turn_calls_a_tool_and_answers_from_it(client: TestClient, turn_request):
    respx.post(f"{BACKEND}/internal/penny/tools").mock(
        return_value=httpx.Response(
            200,
            json={
                "tool": "pantry.expiring",
                "result": [{"name": "spinach", "days_left": 2}],
            },
        )
    )

    response = client.post("/v1/penny/turn", json=turn_request.model_dump())

    assert response.status_code == 200
    body = response.json()
    assert body["outcome"] == "ok"
    # Grounding: what Penny said came from the tool, not from the model.
    assert "spinach" in body["text"]


@respx.mock
def test_a_proposal_is_returned_rather_than_executed(client: TestClient, turn_request):
    respx.post(f"{BACKEND}/internal/penny/tools").mock(
        return_value=httpx.Response(
            200,
            json={
                "tool": "mealplan.generate",
                "proposed": {
                    "id": "action-1",
                    "tool": "mealplan.generate",
                    "summary": "Build a new 7-day meal plan. This replaces your current plan.",
                },
            },
        )
    )
    turn_request.input = "plan my meals for the week"

    body = client.post("/v1/penny/turn", json=turn_request.model_dump()).json()

    assert body["proposed_action"] is not None
    assert body["proposed_action"]["id"] == "action-1"


@respx.mock
def test_the_tool_budget_bounds_a_looping_model(client: TestClient, turn_request):
    """A model that will not stop calling tools runs out of budget.

    The backend enforces its own limit against the audit log; this is the one
    that protects the user's turn from taking forever.
    """
    route = respx.post(f"{BACKEND}/internal/penny/tools").mock(
        return_value=httpx.Response(200, json={"tool": "pantry.expiring", "result": []})
    )

    client.post("/v1/penny/turn", json=turn_request.model_dump())

    assert route.call_count <= 4


def test_streaming_ends_with_a_result_event(client: TestClient, turn_request):
    turn_request.tools = []
    turn_request.input = "hello"

    with client.stream("POST", "/v1/penny/turn/stream", json=turn_request.model_dump()) as response:
        assert response.status_code == 200
        body = "".join(response.iter_text())

    assert "event: result" in body
