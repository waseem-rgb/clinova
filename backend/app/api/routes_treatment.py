# backend/app/api/routes_treatment.py
from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.schemas import TreatmentAdvisorResponse, TreatmentInput
from app.services.treatment import get_treatment_advice

router = APIRouter(tags=["treatment"])


@router.post("/treatment/advice", response_model=TreatmentAdvisorResponse)
async def treatment_advice(payload: TreatmentInput, debug: bool = Query(False)):
    """Get treatment advice for a condition/diagnosis."""
    return get_treatment_advice(payload.dict(), debug=debug)


@router.post("/treatment/plan", response_model=TreatmentAdvisorResponse)
async def treatment_plan(payload: TreatmentInput, debug: bool = Query(False)):
    """Get treatment plan (alias for /treatment/advice)."""
    return get_treatment_advice(payload.dict(), debug=debug)
