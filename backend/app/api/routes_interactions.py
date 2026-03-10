from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from app.services.drugs_curated import check_interactions

router = APIRouter(tags=["interactions"])


class InteractionRequest(BaseModel):
    drugs: List[str]
    context: Optional[Dict[str, Any]] = None


@router.post("/interactions/check")
async def interactions_check(payload: InteractionRequest):
    if len(payload.drugs) < 2:
        raise HTTPException(status_code=400, detail="At least 2 drugs required")
    if len(payload.drugs) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 drugs allowed")

    result = check_interactions(payload.drugs)
    return result
