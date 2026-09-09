"""The HTTP API.

Two shapes, because an import takes tens of seconds:

  POST /v1/imports        -> 202 with an id, poll GET /v1/imports/{id}
  POST /v1/imports:sync   -> blocks and returns the recipe

The async pair is what the mobile app's "paste a link" flow should use. The
sync one exists for the Go server's own tooling and for testing, where a
blocking call is simpler than a poll loop.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse

from . import __version__
from .auth import require_service_auth
from .config import get_settings
from .errors import ImportError_
from .jobs import JobStore
from .models import ImportedRecipe, ImportJobView, ImportRequest
from .pipeline import import_recipe


def create_app(job_store: JobStore | None = None) -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        app.state.jobs.shutdown()

    app = FastAPI(
        title="Help The Hive — recipe import",
        version=__version__,
        description="Turns a cooking video link into a Standard HTH Recipe Object.",
        lifespan=lifespan,
    )
    app.state.jobs = job_store or JobStore(settings)

    @app.exception_handler(ImportError_)
    async def handle_import_error(_: Request, exc: ImportError_) -> JSONResponse:
        return JSONResponse(status_code=exc.http_status, content={"error": exc.as_dict()})

    @app.get("/healthz", include_in_schema=False)
    async def healthz() -> dict:
        """Liveness. Says nothing about whether an import can succeed."""
        return {"status": "ok", "version": __version__}

    @app.get("/readyz", include_in_schema=False)
    async def readyz() -> JSONResponse:
        """Readiness. Not ready without a provider key: an import would fail."""
        settings = get_settings()
        checks = {
            "ai_provider": settings.ai_configured,
            "auth": bool(settings.shared_secret) or not settings.auth_required,
        }
        ready = all(checks.values())
        return JSONResponse(
            status_code=200 if ready else status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "ready" if ready else "not_ready", "checks": checks},
        )

    @app.post(
        "/v1/imports",
        response_model=ImportJobView,
        status_code=status.HTTP_202_ACCEPTED,
        dependencies=[Depends(require_service_auth)],
    )
    async def create_import(payload: ImportRequest) -> ImportJobView:
        """Start an import. Returns immediately with an id to poll."""
        job = app.state.jobs.submit(payload.url, payload.language, payload.owner_user_id)
        return job.view()

    @app.get(
        "/v1/imports/{import_id}",
        response_model=ImportJobView,
        dependencies=[Depends(require_service_auth)],
    )
    async def read_import(import_id: str) -> ImportJobView:
        job = app.state.jobs.get(import_id)
        if job is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="No such import."
            )
        return job.view()

    @app.post(
        "/v1/imports:sync",
        response_model=ImportedRecipe,
        dependencies=[Depends(require_service_auth)],
    )
    async def create_import_sync(payload: ImportRequest) -> ImportedRecipe:
        """Run an import to completion. Slow by nature — expect 20-60s."""
        return import_recipe(payload.url, payload.language, get_settings())

    return app


app = create_app()


def run() -> None:
    import uvicorn

    settings = get_settings()
    uvicorn.run(app, host=settings.http_host, port=settings.http_port)
