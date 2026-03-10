# backend/app/api/routes_calculators.py
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter

from app.services.calculators import calculate, CALCULATOR_LIST

router = APIRouter(tags=["calculators"])


@router.get("/calculators")
async def list_calculators():
    """Return metadata for all available medical calculators."""
    return CALCULATOR_LIST


@router.post("/calculators/{calculator_id}")
async def run_calculator(calculator_id: str, inputs: Dict[str, Any]):
    """Run a specific medical calculator with the given inputs."""
    return calculate(calculator_id, inputs)
