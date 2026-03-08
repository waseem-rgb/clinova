# backend/app/api/routes_treatment.py
from __future__ import annotations

from fastapi import APIRouter, Query, Request, Response

from app.api.schemas import TreatmentAdvisorResponse, TreatmentInput
from app.services.treatment import get_treatment_advice

router = APIRouter(tags=["treatment"])


def _add_timing_headers(response: Response, request: Request, result: dict) -> None:
    timings = result.get("timings", {})

    total_ctx = getattr(request.state, "timings", None)
    if total_ctx is not None:
        total_value = total_ctx.duration_ms("total")
        if total_value is not None:
            response.headers["X-Time-Total-ms"] = str(int(total_value))

    response.headers["X-Time-Retrieval-ms"] = str(int(timings.get("retrieval_ms", 0)))
    response.headers["X-Time-LLM-ms"] = str(int(timings.get("llm_ms", 0)))


@router.post("/treatment/advice", response_model=TreatmentAdvisorResponse)
async def treatment_advice(payload: TreatmentInput, request: Request, response: Response, debug: bool = Query(False)):
    """Get treatment advice for a condition/diagnosis."""
    result = get_treatment_advice(payload.dict(), debug=debug, timings=getattr(request.state, "timings", None))
    _add_timing_headers(response, request, result)
    return result


@router.post("/treatment/plan", response_model=TreatmentAdvisorResponse)
async def treatment_plan(payload: TreatmentInput, request: Request, response: Response, debug: bool = Query(False)):
    """Get treatment plan (alias for /treatment/advice)."""
    result = get_treatment_advice(payload.dict(), debug=debug, timings=getattr(request.state, "timings", None))
    _add_timing_headers(response, request, result)
    return result
