# backend/app/api/routes_assist.py
from __future__ import annotations

import difflib
import json
import os
import re
import time
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

from app.rag.llm_client import client as llm_client

router = APIRouter(tags=["assist"])


class AssistRequest(BaseModel):
    field: str = Field(..., description="symptoms | duration | comorbidities")
    text: str = Field("", description="User input so far")
    limit: int = Field(8, ge=1, le=12)


class AssistResponse(BaseModel):
    suggestions: List[str]
    note: Optional[str] = None


SYMPTOM_SUGGESTIONS = [
    "fever",
    "shortness of breath",
    "shortness of breath on exertion",
    "shortness of breath at rest",
    "shortness of breath with chest pain",
    "shortness of breath with wheezing",
    "shortness of breath and cough",
    "chest pain",
    "pleuritic chest pain",
    "cough",
    "hemoptysis",
    "palpitations",
    "syncope",
    "leg swelling",
    "orthopnea",
]

COMORBID_SUGGESTIONS = [
    "diabetes mellitus",
    "hypertension",
    "chronic kidney disease",
    "coronary artery disease",
    "heart failure",
    "atrial fibrillation",
    "chronic obstructive pulmonary disease",
    "asthma",
    "obesity",
    "anemia",
]

DURATION_SUGGESTIONS = [
    "since yesterday",
    "for 2 days",
    "for 3 days",
    "for 1 week",
    "for 2 weeks",
    "for 1 month",
    "for 3 months",
]


def _normalize_term(field: str, text: str) -> str:
    t = re.sub(r"\s+", " ", (text or "").strip())
    t = re.sub(r"^[\-\*\d\.\s]+", "", t)
    t = re.sub(r"[\s,;]+$", "", t)
    t_low = t.lower()
    # Fix common truncations/abbrev expansions
    fixes = {
        "iabetes": "diabetes",
        "mellitu": "mellitus",
        "mellit": "mellitus",
        "hypertensio": "hypertension",
        "cardiomyopath": "cardiomyopathy",
        "ckd": "chronic kidney disease",
        "copd": "chronic obstructive pulmonary disease",
        "dm": "diabetes mellitus",
        "htn": "hypertension",
    }
    for bad, good in fixes.items():
        t_low = re.sub(rf"\b{re.escape(bad)}\b", good, t_low)
    t_low = t_low.replace("diabetes mellitu", "diabetes mellitus")
    t_low = t_low.replace("diabetes mellitus mellitus", "diabetes mellitus")
    t_low = t_low.strip()

    if field == "comorbidities":
        # Title-case for display, keep acronyms uppercase
        words = []
        for w in t_low.split():
            if w.upper() in {"CKD", "COPD", "DM", "HTN"}:
                words.append(w.upper())
            else:
                words.append(w.capitalize())
        return " ".join(words).strip()

    if field == "duration":
        return t_low

    # symptoms
    return t_low


def _suggest_from_list(items: List[str], text: str, limit: int) -> List[str]:
    q = (text or "").strip().lower()
    if not q:
        return []
    prefix = [i for i in items if i.lower().startswith(q)]
    if prefix:
        return prefix[:limit]
    fuzzy = difflib.get_close_matches(q, items, n=limit, cutoff=0.6)
    return fuzzy


def _duration_from_number(text: str) -> List[str]:
    m = re.search(r"\b(\d{1,2})\b", text)
    if not m:
        return []
    n = int(m.group(1))
    if n == 1:
        return [f"for {n} day", f"for {n} week", f"for {n} month"]
    return [f"for {n} days", f"for {n} weeks", f"for {n} months"]


def _clean_list(items: List[str], limit: int, field: str) -> List[str]:
    """
    Clean and validate suggestion items.
    Prevents partial/truncated words from being returned.
    """
    cleaned: List[str] = []
    seen = set()

    # Patterns that indicate partial/truncated terms
    partial_patterns = [
        r"^\w{1,2}$",  # Very short (1-2 chars)
        r"^[a-z]+ness$" if not field == "symptoms" else None,  # Spurious -ness
        r"^\d+$",  # Just numbers
        r"^[A-Z]{1,2}$",  # Single capital letters
    ]
    partial_patterns = [p for p in partial_patterns if p]

    for item in items:
        s = _normalize_term(field, str(item))

        # Skip if too short
        if len(s) < 4:
            continue

        # Skip if any word is just 1 character (partial word indicator)
        words = s.split()
        if any(len(w) <= 1 for w in words):
            continue

        # Skip if looks like a partial/truncated term
        if any(re.match(p, s) for p in partial_patterns):
            continue

        # Skip if starts with lowercase and looks incomplete
        # (e.g., "hortness" instead of "shortness")
        if field == "symptoms" and s and s[0].islower():
            # Check if it's a known complete term
            if s not in SYMPTOM_SUGGESTIONS and not any(s in sugg for sugg in SYMPTOM_SUGGESTIONS):
                # Check if it looks like a truncated word
                if len(s) < 6 and not s.endswith("ing") and not s.endswith("ed"):
                    continue

        key = s.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(s)
        if len(cleaned) >= limit:
            break
    return cleaned


def _rule_based_suggestions(field: str, text: str, limit: int) -> List[str]:
    if field == "symptoms":
        base = _suggest_from_list(SYMPTOM_SUGGESTIONS, text, limit)
        return _clean_list(base, limit, field)
    if field == "comorbidities":
        base = _suggest_from_list(COMORBID_SUGGESTIONS, text, limit)
        return _clean_list(base, limit, field)
    if field == "duration":
        dur = _duration_from_number(text) or _suggest_from_list(DURATION_SUGGESTIONS, text, limit)
        return _clean_list(dur, limit, field)
    return []


@router.post("/assist/terms", response_model=AssistResponse)
async def assist_terms(
    payload: AssistRequest,
    request: Request,
    response: Response,
    llm: bool = Query(False),
) -> AssistResponse:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    field = payload.field.strip().lower()
    if field not in {"symptoms", "duration", "comorbidities"}:
        raise HTTPException(status_code=400, detail="field must be symptoms|duration|comorbidities")

    text = payload.text.strip()
    if len(text) < 2:
        response.headers["X-Time-LLM-ms"] = "0"
        response.headers["X-Time-Retrieval-ms"] = "0"
        return AssistResponse(suggestions=[])

    # Rule-based suggestions only by default (fast path)
    suggestions = _rule_based_suggestions(field, text, payload.limit)
    if suggestions:
        response.headers["X-Time-LLM-ms"] = "0"
        response.headers["X-Time-Retrieval-ms"] = "0"
        return AssistResponse(suggestions=suggestions)

    # If rule-based is empty, optionally fallback to LLM
    if not llm or not api_key:
        response.headers["X-Time-LLM-ms"] = "0"
        response.headers["X-Time-Retrieval-ms"] = "0"
        note = None if llm else None
        if llm and not api_key:
            note = "OPENAI_API_KEY not set"
        return AssistResponse(suggestions=[], note=note)

    prompt = (
        "Return ONLY a JSON array of up to {limit} short, clinical suggestions.\n"
        "Field: {field}\n"
        "User input: {text}\n\n"
        "Rules:\n"
        "- Symptoms: symptom phrases only, not diagnoses.\n"
        "- Comorbidities: chronic conditions only, not symptoms.\n"
        "- Duration: temporal phrases only (e.g., '3 days', '2 weeks', 'since yesterday').\n"
        "- No prose. No numbering. No markdown. JSON array only.\n"
        "- Do not return partial or truncated words.\n"
        "- Each suggestion should be complete and understandable on its own."
    ).format(limit=payload.limit, field=field, text=text)

    llm_start = time.monotonic()
    resp = await llm_client.chat.completions.create(
        model=os.environ.get("OPENAI_CHAT_MODEL", "gpt-4.1-mini"),
        messages=[
            {"role": "system", "content": "You are a medical autocomplete assistant. Be concise and precise."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
    )
    llm_ms = (time.monotonic() - llm_start) * 1000

    response.headers["X-Time-LLM-ms"] = str(int(llm_ms))
    response.headers["X-Time-Retrieval-ms"] = "0"

    total_ctx = getattr(request.state, "timings", None)
    if total_ctx is not None:
        total_value = total_ctx.duration_ms("total")
        if total_value is not None:
            response.headers["X-Time-Total-ms"] = str(int(total_value))

    content = resp.choices[0].message.content or ""

    suggestions_out: List[str] = []
    try:
        data = json.loads(content)
        if isinstance(data, list):
            suggestions_out = [str(x) for x in data]
    except Exception:
        # Fallback: extract bullet/line items
        lines = [l.strip() for l in content.splitlines() if l.strip()]
        suggestions_out = lines

    return AssistResponse(suggestions=_clean_list(suggestions_out, payload.limit, field))
