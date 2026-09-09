"""Service-to-service auth.

The Go API server is the only intended caller, and it already holds the
verified user identity from the JWT. So this service does not re-verify user
tokens: it authenticates *the server*, with a shared secret, and trusts the
`ownerUserId` the server passes.

That trust is the reason this service must never be reachable from the public
internet or from the mobile app. On Cloud Run it runs with ingress restricted
to internal traffic; see docs/deployment.md.
"""

from __future__ import annotations

import hmac

from fastapi import Header, HTTPException, status

from .config import get_settings


def require_service_auth(authorization: str | None = Header(default=None)) -> None:
    settings = get_settings()

    if not settings.auth_required:
        return  # development convenience only; production always requires it

    if not settings.shared_secret:
        # Configured for production but given no secret: fail closed rather
        # than silently serving an open endpoint.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="IMPORT_SHARED_SECRET is not configured.",
        )

    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(token, settings.shared_secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid service credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )
