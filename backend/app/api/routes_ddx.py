# backend/app/api/routes_ddx.py
from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.schemas import DDxInput, DDxResponse
from app.services.ddx import run_ddx

# Root cause (DDx drift + coverage failures):
# - Queries mixed symptoms + comorbidities and pulled unrelated textbook chunks (OBGYN/peds/index pages).
# - No junk/index filtering or domain constraints before synthesis.
# - Evidence IDs were unstable and coverage checked unused chunks, causing "missing hashes".
# Fix:
# - Symptom-led retrieval + domain filters + junk gating + stable evidence IDs + strict coverage on referenced IDs.

router = APIRouter(tags=["ddx"])


@router.post("/ddx/run", response_model=DDxResponse)
async def ddx_run(payload: DDxInput, debug: bool = Query(False)):
    """Run differential diagnosis analysis."""
    return run_ddx(payload.dict(), debug=debug)
