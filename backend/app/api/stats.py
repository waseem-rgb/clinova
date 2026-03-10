# backend/app/api/stats.py
"""Live content statistics endpoint."""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter

logger = logging.getLogger("clinova.stats")
router = APIRouter(tags=["stats"])

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def _safe_load_json(path: Path) -> Any:
    """Load JSON file, return None on failure."""
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        logger.warning("Failed to load %s", path)
        return None


@lru_cache(maxsize=1)
def _count_treatment_conditions() -> int:
    """Count unique treatment conditions across all expanded_topics files."""
    total = 0
    for f in sorted(DATA_DIR.glob("expanded_topics*.json")):
        data = _safe_load_json(f)
        if isinstance(data, dict):
            for cat_data in data.values():
                if isinstance(cat_data, list):
                    total += len(cat_data)
                elif isinstance(cat_data, dict):
                    for v2 in cat_data.values():
                        if isinstance(v2, list):
                            total += len(v2)
                        else:
                            total += 1
    return total


@lru_cache(maxsize=1)
def _count_drugs() -> int:
    """Count curated drugs."""
    data = _safe_load_json(DATA_DIR / "curated_drugs.json")
    if not isinstance(data, dict):
        return 0
    drugs = data.get("drugs", {})
    return len(drugs) if isinstance(drugs, dict) else 0


@lru_cache(maxsize=1)
def _count_drug_interaction_rules() -> int:
    """Count curated interaction rules."""
    data = _safe_load_json(DATA_DIR / "curated_interactions.json")
    if not isinstance(data, dict):
        return 0
    interactions = data.get("interactions", [])
    return len(interactions) if isinstance(interactions, list) else 0


@lru_cache(maxsize=1)
def _count_emergency_protocols() -> int:
    """Count emergency protocols."""
    data = _safe_load_json(DATA_DIR / "emergency_protocols.json")
    if isinstance(data, dict) and "protocols" in data:
        return len(data["protocols"])
    if isinstance(data, list):
        return len(data)
    return 0


@lru_cache(maxsize=1)
def _count_topics() -> int:
    """Count topics from master index."""
    data = _safe_load_json(DATA_DIR / "master_topic_index.json")
    if isinstance(data, dict):
        topics = data.get("topics", [])
        return len(topics) if isinstance(topics, list) else 0
    return 0


@lru_cache(maxsize=1)
def _count_courses() -> int:
    """Count CME courses from learning module."""
    try:
        from app.api.routes_learning import COURSES
        return len(COURSES)
    except Exception:
        return 0


@lru_cache(maxsize=1)
def _count_clinical_pearls() -> int:
    data = _safe_load_json(DATA_DIR / "clinical_pearls.json")
    return len(data) if isinstance(data, list) else 0


@lru_cache(maxsize=1)
def _count_quiz_questions() -> int:
    data = _safe_load_json(DATA_DIR / "quiz_questions.json")
    return len(data) if isinstance(data, list) else 0


@router.get("/stats")
async def get_stats() -> Dict[str, Any]:
    """Return live counts of all content types."""
    return {
        "treatment_conditions": _count_treatment_conditions(),
        "drugs": _count_drugs(),
        "drug_interaction_rules": _count_drug_interaction_rules(),
        "emergency_protocols": _count_emergency_protocols(),
        "topics": _count_topics(),
        "cme_courses": _count_courses(),
        "clinical_pearls": _count_clinical_pearls(),
        "quiz_questions": _count_quiz_questions(),
    }
