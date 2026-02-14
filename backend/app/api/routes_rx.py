from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, Dict, Any

from app.services.rxstudio import build_rx_draft

router = APIRouter()


class RxRequest(BaseModel):
    transcript: str
    patient: Optional[Dict[str, Any]] = None
    intent: Optional[str] = "both"


@router.post("/rxstudio/draft")
async def rx_draft(payload: RxRequest):
    return build_rx_draft(payload.dict())
