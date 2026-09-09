"""The wire contract with the Go backend.

These mirror internal/domain/penny/turn.go. They are duplicated rather than
generated because the duplication is small and the alternative is a build step
between two languages — but the contract test in the Go tools package and the
one in tests/test_contract.py both exist to catch a drift, because a mismatch
here is a runtime failure in front of a user.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class TurnUser(BaseModel):
    first_name: str = ""
    jurisdiction: str = ""


class TurnMessage(BaseModel):
    role: Literal["user", "penny"]
    content: str


class ToolDescriptor(BaseModel):
    """A tool, as the server describes it.

    The field names are the Go struct's, capitalised, because that is what
    encoding/json emits for exported fields without tags — and the descriptors
    are built from the registry, which is the one place a tool is defined.
    """

    Name: str
    Scope: str
    Risk: str
    Description: str
    Arguments: list[str] = Field(default_factory=list)
    Required: list[str] = Field(default_factory=list)
    Sensitive: list[str] = Field(default_factory=list)


class TurnRequest(BaseModel):
    turn_id: str
    conversation_id: str
    tool_token: str
    user: TurnUser = Field(default_factory=TurnUser)
    input: str
    history: list[TurnMessage] = Field(default_factory=list)
    summary: str = ""
    scopes: list[str] = Field(default_factory=list)
    tools: list[ToolDescriptor] = Field(default_factory=list)


class TurnResult(BaseModel):
    text: str
    outcome: Literal["ok", "refused", "failed", "rate_limited"] = "ok"
    citations: list[dict[str, Any]] = Field(default_factory=list)
    proposed_action: dict[str, Any] | None = None
    provider: str = ""
    model: str = ""
