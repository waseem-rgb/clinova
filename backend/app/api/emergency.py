# backend/app/api/emergency.py
"""
Emergency Protocols API — Clinova

Serves life-safety emergency protocol data from the seed JSON file.
Protocols cover: Snake Bite, Acute MI, Stroke, Anaphylaxis, Status Epilepticus,
Obstetric Emergency, Pediatric Emergency, Acute Pulmonary Edema, Poisoning,
Cardiac Arrest (BLS/ACLS).
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger("clinova.emergency")

router = APIRouter(prefix="/emergency", tags=["emergency"])

_DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "emergency_protocols.json"


@lru_cache(maxsize=1)
def _load_protocols() -> Dict[str, Any]:
    """Load and cache emergency protocols from JSON seed file."""
    if not _DATA_FILE.exists():
        logger.error(f"Emergency protocols data file not found: {_DATA_FILE}")
        raise FileNotFoundError(f"Emergency protocols data file not found")
    with open(_DATA_FILE, encoding="utf-8") as f:
        return json.load(f)


def _get_all_protocols() -> List[Dict[str, Any]]:
    return _load_protocols().get("protocols", [])


# ─────────────────────────────────────────────
# GET /api/emergency/protocols
# ─────────────────────────────────────────────

@router.get("/protocols")
def list_protocols(request: Request):
    """
    Return summary cards for all emergency protocols.
    Omits detailed step-by-step content — use /protocols/{id} for full detail.
    """
    protocols = _get_all_protocols()
    summaries = [
        {
            "id": p["id"],
            "name": p["name"],
            "icon": p["icon"],
            "category": p["category"],
            "color": p.get("color", "#DC2626"),
            "summary": p["summary"],
            "tags": p.get("tags", []),
            "step_count": len(p.get("steps", [])),
            "medication_count": len(p.get("medications", [])),
        }
        for p in protocols
    ]
    return {"protocols": summaries, "total": len(summaries)}


# ─────────────────────────────────────────────
# GET /api/emergency/protocols/{protocol_id}
# ─────────────────────────────────────────────

@router.get("/protocols/{protocol_id}")
def get_protocol(protocol_id: str, request: Request):
    """
    Return full emergency protocol detail including steps, medications, timers,
    red flags, and pre-referral checklist.
    """
    protocols = _get_all_protocols()
    for p in protocols:
        if p["id"] == protocol_id:
            return p
    raise HTTPException(status_code=404, detail=f"Protocol '{protocol_id}' not found")


# ─────────────────────────────────────────────
# GET /api/emergency/protocols/search?q=
# ─────────────────────────────────────────────

@router.get("/search")
def search_protocols(q: str = "", request: Request = None):
    """
    Search emergency protocols by name, tags, or summary text.
    """
    if not q.strip():
        return list_protocols(request)

    q_lower = q.lower()
    protocols = _get_all_protocols()
    results = []
    for p in protocols:
        searchable = " ".join([
            p.get("name", ""),
            p.get("summary", ""),
            " ".join(p.get("tags", [])),
        ]).lower()
        if q_lower in searchable:
            results.append({
                "id": p["id"],
                "name": p["name"],
                "icon": p["icon"],
                "category": p["category"],
                "summary": p["summary"],
            })

    return {"protocols": results, "total": len(results), "query": q}
