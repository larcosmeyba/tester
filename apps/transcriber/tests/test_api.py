"""The HTTP surface, exercised without touching the network or a provider."""

import time

import pytest
from fastapi.testclient import TestClient

from hth_transcriber.api import create_app
from hth_transcriber.config import get_settings, reset_settings
from hth_transcriber.errors import VideoUnavailable
from hth_transcriber.jobs import JobStore
from hth_transcriber.normalize import normalize
from tests.test_normalize import COMPLETE


def make_client(bundle, runner=None, **env):
    """A client whose imports are a stub, so nothing leaves the process."""

    import os

    for key, value in env.items():
        os.environ[key] = value
    reset_settings()

    def default_runner(url, language, settings, on_progress=None):
        if on_progress:
            on_progress("fetching_transcript")
        return normalize(COMPLETE, bundle)

    store = JobStore(get_settings(), runner=runner or default_runner)
    return TestClient(create_app(store))


def poll(client, import_id, headers=None, tries=50):
    for _ in range(tries):
        response = client.get(f"/v1/imports/{import_id}", headers=headers or {})
        body = response.json()
        if body["status"] in ("succeeded", "failed"):
            return body
        time.sleep(0.02)
    raise AssertionError("import never settled")


def test_healthz_is_open(bundle):
    client = make_client(bundle)
    assert client.get("/healthz").json()["status"] == "ok"


def test_readyz_is_not_ready_without_a_provider_key(bundle, monkeypatch):
    monkeypatch.delenv("RECIPE_AI_API_KEY", raising=False)
    client = make_client(bundle)

    response = client.get("/readyz")
    assert response.status_code == 503
    assert response.json()["checks"]["ai_provider"] is False


def test_readyz_is_ready_once_configured(bundle):
    client = make_client(bundle, RECIPE_AI_API_KEY="sk-test")
    assert client.get("/readyz").status_code == 200


def test_import_runs_and_returns_the_recipe(bundle):
    client = make_client(bundle)

    created = client.post("/v1/imports", json={"url": "https://youtu.be/abc"})
    assert created.status_code == 202
    body = created.json()
    # A fast stub can settle before the response is serialised, so only the
    # id and the 202 are guaranteed here.
    assert body["importId"]
    assert body["status"] in ("queued", "running", "succeeded")

    settled = poll(client, body["importId"])
    assert settled["status"] == "succeeded"
    assert settled["recipe"]["title"] == "Weeknight Dal"
    assert settled["recipe"]["sourceType"] == "video_import"
    assert settled["recipe"]["visibility"] == "private"


def test_recipe_payload_uses_the_graphql_field_names(bundle):
    client = make_client(bundle)
    created = client.post("/v1/imports", json={"url": "https://youtu.be/abc"})
    recipe = poll(client, created.json()["importId"])["recipe"]

    for field in (
        "baseMealPlanEligible",
        "missingInformation",
        "servingsConfidence",
        "totalTimeMinutes",
        "attributionText",
    ):
        assert field in recipe, field
    assert "isToTaste" in recipe["ingredients"][0]


def test_a_failed_import_reports_a_named_error(bundle):
    def failing(url, language, settings, on_progress=None):
        raise VideoUnavailable("That video is private.")

    client = make_client(bundle, runner=failing)
    created = client.post("/v1/imports", json={"url": "https://youtu.be/abc"})
    settled = poll(client, created.json()["importId"])

    assert settled["status"] == "failed"
    assert settled["error"]["code"] == "VIDEO_UNAVAILABLE"


def test_unknown_import_is_404(bundle):
    client = make_client(bundle)
    assert client.get("/v1/imports/nope").status_code == 404


def test_a_secret_locks_the_import_endpoints(bundle):
    client = make_client(bundle, IMPORT_SHARED_SECRET="s3cret")

    assert client.post("/v1/imports", json={"url": "https://youtu.be/abc"}).status_code == 401
    assert client.post(
        "/v1/imports",
        json={"url": "https://youtu.be/abc"},
        headers={"Authorization": "Bearer wrong"},
    ).status_code == 401

    ok = client.post(
        "/v1/imports",
        json={"url": "https://youtu.be/abc"},
        headers={"Authorization": "Bearer s3cret"},
    )
    assert ok.status_code == 202


def test_production_without_a_secret_fails_closed(bundle):
    client = make_client(bundle, APP_ENV="production")

    response = client.post("/v1/imports", json={"url": "https://youtu.be/abc"})
    assert response.status_code == 500


@pytest.fixture(autouse=True)
def _clear(monkeypatch):
    yield
    for name in ("IMPORT_SHARED_SECRET", "APP_ENV", "RECIPE_AI_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    reset_settings()
