"""The client for the Help The Hive tool gateway.

This module is the entirety of Penny's ability to affect anything. There is no
database driver in this process and no other outbound client that touches user
data — a tool call goes here, over HTTP, carrying the per-turn token the Go
server minted, and the Go server decides what actually happens.

The asymmetry is the point. This side can ask. Only the other side can act.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from penny.obs.logging import logger


@dataclass
class ToolOutcome:
    """One tool call's result, as the graph sees it."""

    tool: str
    result: Any = None
    error: str = ""
    # Refused by policy rather than failed. The model is told the difference,
    # because a denied call is not a problem to work around.
    denied: bool = False
    # The server turned a high-impact write into something for the user to
    # agree to. Nothing was written.
    proposed: dict | None = None

    @property
    def ok(self) -> bool:
        return not self.error and not self.denied

    def for_model(self) -> str:
        """What the model is shown. Short, and honest about what happened."""
        if self.proposed:
            return (
                f"NOT DONE YET. {self.tool} needs the user to agree first. "
                f"Tell them what you are about to do and ask. "
                f"Proposed: {self.proposed.get('summary', '')}"
            )
        if self.denied:
            return f"DENIED: {self.error}. Do not try this another way; tell the user you cannot do it."
        if self.error:
            return f"FAILED: {self.error}"
        return _render(self.result)


class ToolGateway:
    def __init__(self, base_url: str, service_token: str, timeout: float) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            timeout=timeout,
            headers={"Authorization": f"Bearer {service_token}"},
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def call(self, tool_token: str, turn_id: str, name: str, arguments: dict) -> ToolOutcome:
        try:
            response = await self._client.post(
                "/internal/penny/tools",
                json={
                    "tool_token": tool_token,
                    "turn_id": turn_id,
                    "tool": name,
                    "arguments": arguments,
                },
            )
        except httpx.HTTPError:
            logger().warning("tool call could not reach the backend", tool=name, turn=turn_id)
            return ToolOutcome(tool=name, error="Help The Hive could not be reached")

        if response.status_code in (401, 403):
            # The token expired or was refused. Not something to retry: the turn
            # has outlived its authority.
            return ToolOutcome(tool=name, denied=True, error="this turn is no longer authorised")
        if response.status_code >= 400:
            return ToolOutcome(tool=name, error="Help The Hive rejected the request")

        body = response.json()
        return ToolOutcome(
            tool=body.get("tool", name),
            result=body.get("result"),
            error=body.get("error", ""),
            denied=bool(body.get("denied")),
            proposed=body.get("proposed"),
        )


def _render(result: Any) -> str:
    """Tool results reach the model as compact JSON.

    Truncated hard. A pantry with three hundred items is a context window
    problem and a cost problem, and the answer to "what's in my fridge" does not
    improve past the first few dozen.
    """
    import json

    if result is None:
        return "No result."
    text = json.dumps(result, separators=(",", ":"), default=str)
    if len(text) > 4000:
        return text[:4000] + " …(truncated)"
    return text
