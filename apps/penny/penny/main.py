"""The Penny agent service.

Reads the config, builds one provider and one graph, serves two endpoints.

The thing to notice is what is not constructed here: no database pool, no
migration runner, no store of any kind. This process holds a client for the LLM
provider and a client for the Help The Hive backend, and that is the whole of
what it can reach.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from penny.api import chat, health
from penny.config import settings
from penny.graph.graph import build
from penny.obs.logging import configure, logger
from penny.providers.factory import build as build_provider
from penny.tools.gateway import ToolGateway


@asynccontextmanager
async def lifespan(app: FastAPI):
    config = settings()
    configure(config.log_level)

    provider = build_provider(config)
    gateway = ToolGateway(
        base_url=config.backend_url,
        service_token=config.service_token,
        timeout=config.request_timeout_seconds,
    )

    app.state.settings = config
    app.state.provider = provider
    app.state.gateway = gateway
    app.state.graph = build(
        provider=provider,
        gateway=gateway,
        max_tool_calls=config.max_tool_calls,
        max_tokens=config.max_output_tokens,
    )

    logger().info(
        "penny started",
        env=config.env,
        provider=provider.name,
        model=provider.model,
        backend=config.backend_url,
    )
    try:
        yield
    finally:
        await gateway.aclose()
        if closer := getattr(provider, "aclose", None):
            await closer()


def create_app() -> FastAPI:
    app = FastAPI(title="Penny", version="0.1.0", lifespan=lifespan)
    app.include_router(health.router)
    app.include_router(chat.router)
    return app


app = create_app()
