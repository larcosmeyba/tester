"""One turn, streamed or not.

Both endpoints run the same graph. The streaming one sends text as it is
written and the finished result last; the Go server treats the result as
authoritative and the deltas as a preview, because its output guard runs on the
finished text.
"""

from __future__ import annotations

import json
from typing import AsyncIterator

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from penny.api.deps import require_backend
from penny.api.schemas import TurnRequest, TurnResult
from penny.obs.logging import bind_turn, logger
from penny.policy.redaction import preview
from penny.providers.base import Message, ToolSpec

router = APIRouter(dependencies=[Depends(require_backend)])


@router.post("/v1/penny/turn", response_model=TurnResult)
async def turn(request: Request, body: TurnRequest) -> TurnResult:
    bind_turn(body.turn_id, body.conversation_id)
    logger().info("turn started", scopes=body.scopes, tools=len(body.tools),
                  input=preview(body.input))

    state = await request.app.state.graph.ainvoke(_initial(body))
    result = _result(state)

    logger().info("turn finished", outcome=result.outcome, provider=result.provider,
                  citations=len(result.citations), proposed=bool(result.proposed_action))
    return result


@router.post("/v1/penny/turn/stream")
async def turn_stream(request: Request, body: TurnRequest) -> StreamingResponse:
    bind_turn(body.turn_id, body.conversation_id)
    logger().info("streaming turn started", scopes=body.scopes, input=preview(body.input))

    async def events() -> AsyncIterator[str]:
        try:
            # astream_events surfaces the model's token stream from inside the
            # graph. Only the final agent pass is streamed to the user: the
            # earlier ones are the model deciding which tools to call, and
            # showing somebody a half-written sentence that is about to be
            # thrown away is worse than showing them nothing.
            state = None
            async for event in request.app.state.graph.astream_events(
                _initial(body), version="v2"
            ):
                if event["event"] == "on_chat_model_stream":
                    chunk = event["data"].get("chunk")
                    text = getattr(chunk, "content", "") or ""
                    if text:
                        yield _event("delta", {"text": text})
                elif event["event"] == "on_chain_end" and event.get("name") == "LangGraph":
                    state = event["data"]["output"]

            if state is None:
                state = await request.app.state.graph.ainvoke(_initial(body))

            result = _result(state)
            logger().info("streaming turn finished", outcome=result.outcome)
            yield _event("result", result.model_dump())
        except Exception:  # noqa: BLE001 - the client gets a marker, the log gets the trace
            logger().exception("streaming turn failed")
            yield _event("error", {"message": "the turn failed"})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _event(name: str, payload: dict) -> str:
    return f"event: {name}\ndata: {json.dumps(payload)}\n\n"


def _initial(body: TurnRequest) -> dict:
    """The graph's starting state.

    Note that the tools come from the request. This process has no tool list of
    its own: what Penny can do in this turn was decided by the router on the
    server, and a tool absent from this list is one the model is never told
    about.
    """
    return {
        "turn_id": body.turn_id,
        "conversation_id": body.conversation_id,
        "tool_token": body.tool_token,
        "user_first_name": body.user.first_name,
        "jurisdiction": body.user.jurisdiction,
        "input": body.input,
        "summary": body.summary,
        "history": [
            Message(role="assistant" if m.role == "penny" else "user", content=m.content)
            for m in body.history
        ],
        "tools": [
            ToolSpec(
                name=tool.Name,
                description=tool.Description,
                arguments=tool.Arguments,
                required=tool.Required,
            )
            for tool in body.tools
        ],
    }


def _result(state: dict) -> TurnResult:
    text = (state.get("text") or "").strip()
    outcome = state.get("outcome", "ok")

    # A turn that ended on a proposal and said nothing is a confirmation card
    # with no question on it. The server writes the sentence in that case, from
    # the proposal it created, rather than the model.
    if not text and state.get("proposed_action"):
        text = state["proposed_action"].get("summary", "") + " Shall I go ahead?"

    if not text:
        text = "Sorry — I didn't manage to put that together. Try asking again?"
        outcome = "failed"

    return TurnResult(
        text=text,
        outcome=outcome,
        citations=state.get("citations") or [],
        proposed_action=state.get("proposed_action"),
        provider=state.get("provider", ""),
        model=state.get("model", ""),
    )
