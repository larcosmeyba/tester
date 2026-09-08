"""Who is allowed to ask this service for anything.

The answer is: the Help The Hive backend, and nothing else. There is no user
authentication here because there are no users here — a person's bearer token
never reaches this process, by design. What arrives is a request the Go server
signed, carrying a tool token the Go server minted.
"""

from __future__ import annotations

import secrets

from fastapi import Header, HTTPException, Request, status

from penny.config import Settings


def require_backend(request: Request, authorization: str = Header(default="")) -> None:
    settings: Settings = request.app.state.settings

    # In development with no token set, the service answers locally. Config
    # refuses to start without one in any other environment, so this cannot be
    # the production path.
    if settings.is_development and not settings.service_token:
        return

    token = authorization.removeprefix("Bearer ").strip()
    # Constant time: a comparison that returns on the first wrong byte tells a
    # caller how much of a guess was right.
    if not secrets.compare_digest(token, settings.service_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized")
