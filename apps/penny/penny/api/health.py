from __future__ import annotations

from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/detailed")
async def detailed(request: Request) -> dict[str, object]:
    """What this process is configured as.

    No secrets, no key prefixes, no backend token. A readiness endpoint that
    leaks the shape of a credential is a readiness endpoint worth scraping.
    """
    settings = request.app.state.settings
    return {
        "status": "ok",
        "env": settings.env,
        "provider": settings.provider,
        "model": settings.model,
        "backend_configured": bool(settings.backend_url),
        "max_tool_calls": settings.max_tool_calls,
        # Stated explicitly, because it is the property the whole architecture
        # rests on and it should be checkable from outside.
        "database_access": False,
    }
