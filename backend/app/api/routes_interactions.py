from __future__ import annotations

from fastapi import APIRouter, Query, Response
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from app.services.interactions import check_interactions

router = APIRouter(tags=["interactions"])


class InteractionRequest(BaseModel):
    drugs: List[str]
    context: Optional[Dict[str, Any]] = None


def _add_timing_headers(response: Response, result: dict) -> None:
    """Add timing and cache headers to response."""
    timings = result.get("timings", {})
    
    # Cache status
    cache_hit = timings.get("cache_hit", False)
    response.headers["X-Cache"] = "HIT" if cache_hit else "MISS"
    
    # Timing headers
    response.headers["X-Time-Total-ms"] = str(int(timings.get("total_ms", 0)))
    response.headers["X-Time-LLM-ms"] = str(int(timings.get("llm_ms", 0)))
    response.headers["X-Time-Retrieve-ms"] = str(int(timings.get("retrieval_ms", 0)))
    
    # Risk level header
    response.headers["X-Risk-Level"] = result.get("overall_risk_level", "Unknown")


@router.post("/interactions/check")
async def interactions_check(
    payload: InteractionRequest,
    response: Response,
    debug: bool = Query(False),
):
    result = check_interactions(payload.dict(), debug=debug)
    _add_timing_headers(response, result)
    return result
