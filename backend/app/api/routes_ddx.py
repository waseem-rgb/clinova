# backend/app/api/routes_ddx.py
from __future__ import annotations

from fastapi import APIRouter, Query, Request, Response

from app.api.schemas import DDxInput, DDxResponse
from app.services.ddx import run_ddx

# Root cause (DDx drift + coverage failures):
# - Queries mixed symptoms + comorbidities and pulled unrelated textbook chunks (OBGYN/peds/index pages).
# - No junk/index filtering or domain constraints before synthesis.
# - Evidence IDs were unstable and coverage checked unused chunks, causing "missing hashes".
# Fix:
# - Symptom-led retrieval + domain filters + junk gating + stable evidence IDs + strict coverage on referenced IDs.

router = APIRouter(tags=["ddx"])


def _add_timing_headers(response: Response, request: Request, result: dict) -> None:
    timings = result.get("timings", {})

    total_ctx = getattr(request.state, "timings", None)
    if total_ctx is not None:
        total_value = total_ctx.duration_ms("total")
        if total_value is not None:
            response.headers["X-Time-Total-ms"] = str(int(total_value))

    response.headers["X-Time-Retrieval-ms"] = str(int(timings.get("retrieval_ms", 0)))
    response.headers["X-Time-LLM-ms"] = str(int(timings.get("llm_ms", 0)))


@router.post("/ddx/run", response_model=DDxResponse)
async def ddx_run(payload: DDxInput, request: Request, response: Response, debug: bool = Query(False)):
    """Run differential diagnosis analysis."""
    result = run_ddx(payload.dict(), debug=debug, timings=getattr(request.state, "timings", None))
    _add_timing_headers(response, request, result)
    return result
