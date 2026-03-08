# backend/app/api/routes_learning.py
# Clinova — Learning & CME module endpoints
from __future__ import annotations

import json
import logging
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger("clinova.learning")
router = APIRouter(prefix="/learning", tags=["learning"])

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


# ─── Cached data loaders ─────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _load_pearls() -> list[dict]:
    path = DATA_DIR / "clinical_pearls.json"
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def _load_quiz() -> list[dict]:
    path = DATA_DIR / "quiz_questions.json"
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _day_index(items: list) -> int:
    """Return 0-based index into list based on day of year (cycles)."""
    doy = date.today().timetuple().tm_yday  # 1-365
    return (doy - 1) % len(items)


# ─── Schemas ─────────────────────────────────────────────────────────────────

class QuizSubmission(BaseModel):
    question_id: int
    selected_option: int  # 0-indexed


# ─── Static course catalogue ─────────────────────────────────────────────────

COURSES = [
    {
        "id": "ebm-basics",
        "title": "Evidence-Based Medicine Basics",
        "emoji": "🔬",
        "modules": 5,
        "duration_min": 50,
        "category": "General",
        "description": "Critical appraisal, levels of evidence, NNT, NNH, and applying evidence at the bedside.",
    },
    {
        "id": "antibiotic-stewardship",
        "title": "Rational Antibiotic Use",
        "emoji": "💊",
        "modules": 4,
        "duration_min": 40,
        "category": "Pharmacology",
        "description": "Selecting the right antibiotic, avoiding resistance, de-escalation, and ESKAPE pathogens.",
    },
    {
        "id": "common-emergencies",
        "title": "Common Emergencies",
        "emoji": "🚨",
        "modules": 6,
        "duration_min": 60,
        "category": "Emergency",
        "description": "Snake bite, MI, stroke, anaphylaxis, PPH, and status epilepticus protocols.",
    },
    {
        "id": "ncd-management",
        "title": "NCD Management — Diabetes, HTN, Thyroid",
        "emoji": "❤️",
        "modules": 5,
        "duration_min": 50,
        "category": "General Medicine",
        "description": "Comprehensive outpatient NCD management for primary care settings.",
    },
    {
        "id": "mch",
        "title": "Maternal & Child Health",
        "emoji": "🤰",
        "modules": 4,
        "duration_min": 40,
        "category": "Obstetrics & Pediatrics",
        "description": "ANC, high-risk pregnancy, IMNCI, immunisation, and nutrition protocols.",
    },
]

# Points per activity
POINTS = {
    "quiz_correct": 10,
    "quiz_wrong": 2,    # participation points
    "module_complete": 50,
    "daily_login": 5,
    "pearl_read": 3,
}

BADGES = [
    {"id": "first-responder", "name": "First Responder", "emoji": "🚑", "description": "Completed the Common Emergencies course"},
    {"id": "drug-safety", "name": "Drug Safety Champion", "emoji": "🛡️", "description": "Answered 10 pharmacology questions correctly"},
    {"id": "antibiotic-steward", "name": "Antibiotic Steward", "emoji": "🔬", "description": "Completed Rational Antibiotic Use course"},
    {"id": "diagnosis-master", "name": "Diagnosis Master", "emoji": "🧠", "description": "Answered 25 quiz questions correctly"},
    {"id": "streak-7", "name": "Week Warrior", "emoji": "🔥", "description": "7-day learning streak"},
    {"id": "streak-30", "name": "Consistent Clinician", "emoji": "⭐", "description": "30-day learning streak"},
    {"id": "cme-1", "name": "CME Pioneer", "emoji": "🎓", "description": "Earned first CME credit"},
]


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("/pearl/today")
def get_today_pearl():
    """Return the clinical pearl for today (date-seeded rotation)."""
    pearls = _load_pearls()
    idx = _day_index(pearls)
    pearl = pearls[idx]
    return {
        "pearl": pearl,
        "day_number": idx + 1,
        "total_pearls": len(pearls),
        "points_on_read": POINTS["pearl_read"],
    }


@router.get("/pearl/{pearl_id}")
def get_pearl(pearl_id: int):
    """Return a specific pearl by ID."""
    pearls = _load_pearls()
    found = next((p for p in pearls if p["id"] == pearl_id), None)
    if not found:
        raise HTTPException(status_code=404, detail=f"Pearl {pearl_id} not found")
    return found


@router.get("/pearls")
def list_pearls(
    category: Optional[str] = Query(None, description="Filter by category"),
    difficulty: Optional[str] = Query(None, description="basic | intermediate | advanced"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List all clinical pearls with optional filtering."""
    pearls = _load_pearls()
    if category:
        pearls = [p for p in pearls if p.get("category", "").lower() == category.lower()]
    if difficulty:
        pearls = [p for p in pearls if p.get("difficulty", "").lower() == difficulty.lower()]
    total = len(pearls)
    return {
        "total": total,
        "pearls": pearls[offset:offset + limit],
    }


@router.get("/quiz/today")
def get_today_quiz():
    """Return the quiz question for today (date-seeded rotation)."""
    questions = _load_quiz()
    idx = _day_index(questions)
    q = questions[idx]
    # Return question WITHOUT correct answer (reveal after submission)
    return {
        "question": {
            "id": q["id"],
            "question": q["question"],
            "options": q["options"],
            "category": q["category"],
            "difficulty": q["difficulty"],
            "tags": q["tags"],
        },
        "day_number": idx + 1,
        "total_questions": len(questions),
        "points_on_correct": POINTS["quiz_correct"],
        "points_on_attempt": POINTS["quiz_wrong"],
    }


@router.post("/quiz/submit")
def submit_quiz_answer(submission: QuizSubmission):
    """Submit a quiz answer and receive explanation + points."""
    questions = _load_quiz()
    q = next((x for x in questions if x["id"] == submission.question_id), None)
    if not q:
        raise HTTPException(status_code=404, detail=f"Question {submission.question_id} not found")

    correct_idx = q["correct"]
    is_correct = submission.selected_option == correct_idx
    points = POINTS["quiz_correct"] if is_correct else POINTS["quiz_wrong"]

    return {
        "is_correct": is_correct,
        "correct_option": correct_idx,
        "correct_text": q["options"][correct_idx],
        "explanation": q["explanation"],
        "reference": q.get("reference", ""),
        "points_earned": points,
        "tags": q.get("tags", []),
    }


@router.get("/courses")
def list_courses():
    """List all available learning courses."""
    return {
        "courses": COURSES,
        "total": len(COURSES),
        "points_per_module": POINTS["module_complete"],
    }


@router.get("/badges")
def list_badges():
    """Return all available achievement badges."""
    return {"badges": BADGES}


@router.get("/points-guide")
def points_guide():
    """Return the points system definition."""
    return {"points": POINTS, "badges": BADGES}
