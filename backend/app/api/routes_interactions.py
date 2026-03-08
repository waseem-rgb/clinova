from __future__ import annotations

from fastapi import APIRouter, Query, Request, Response
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from app.services.interactions import check_interactions

router = APIRouter(tags=["interactions"])


class InteractionRequest(BaseModel):
    drugs: List[str]
    context: Optional[Dict[str, Any]] = None


def _add_timing_headers(response: Response, request: Request, result: dict) -> None:
    """Add timing and cache headers to response."""
    timings = result.get("timings", {})

    # Cache status
    cache_hit = timings.get("cache_hit", False)
    response.headers["X-Cache"] = "HIT" if cache_hit else "MISS"

    # Timing headers
    response.headers["X-Time-Total-ms"] = str(int(timings.get("total_ms", 0)))
    response.headers["X-Time-LLM-ms"] = str(int(timings.get("llm_ms", 0)))
    response.headers["X-Time-Retrieve-ms"] = str(int(timings.get("retrieval_ms", 0)))
    response.headers["X-Time-Retrieval-ms"] = str(int(timings.get("retrieval_ms", 0)))

    total_ctx = getattr(request.state, "timings", None)
    if total_ctx is not None:
        total_value = total_ctx.duration_ms("total")
        if total_value is not None:
            response.headers["X-Time-Total-ms"] = str(int(total_value))

    # Risk level header
    response.headers["X-Risk-Level"] = result.get("overall_risk_level", "Unknown")


@router.post("/interactions/check")
async def interactions_check(
    payload: InteractionRequest,
    request: Request,
    response: Response,
    debug: bool = Query(False),
):
    result = check_interactions(payload.dict(), debug=debug, timings=getattr(request.state, "timings", None))
    _add_timing_headers(response, request, result)
    return result
