# backend/app/services/ddx.py
"""
Differential Diagnosis (DDx) Service - Doctor Grade.

This module provides comprehensive differential diagnosis based on:
- Multi-query retrieval for syndromic, red flags, and workup content
- Strict garbage filtering and deduplication
- LLM-based structured extraction (RAG-only, no hallucination)
- Book priority (Harrison/Oxford first)
- Coverage gating to ensure evidence-backed output
"""
from __future__ import annotations

import difflib
import re
import time
from typing import Any, Dict, List, Optional, Set, Tuple

from app.rag.retrieve.query import retrieve_chunks
from app.rag.cleaners.text_cleaner import (
    filter_and_clean_chunks,
    sort_by_book_priority,
)
from app.rag.extractors.ddx_extractor import extract_ddx_from_chunks
from app.services.timing import TimingContext


# =============================================================================
# SYMPTOM NORMALIZATION
# =============================================================================

SYMPTOM_CANONICAL = [
    "chest pain",
    "chest tightness",
    "shortness of breath",
    "dyspnea",
    "fever",
    "cough",
    "hemoptysis",
    "syncope",
    "palpitations",
    "leg swelling",
    "pleuritic chest pain",
    "wheezing",
    "orthopnea",
    "headache",
    "abdominal pain",
    "nausea",
    "vomiting",
    "diarrhea",
    "fatigue",
    "weakness",
    "dizziness",
    "altered mental status",
    "confusion",
    "seizure",
    "rash",
    "joint pain",
    "back pain",
    "neck stiffness",
    "weight loss",
    "night sweats",
]

SYMPTOM_SYNONYMS = {
    "sob": "shortness of breath",
    "shortne": "shortness of breath",
    "shortness": "shortness of breath",
    "dyspnoea": "dyspnea",
    "dyspnoe": "dyspnea",
    "cp": "chest pain",
    "ams": "altered mental status",
    "loc": "loss of consciousness",
    "ha": "headache",
    "n/v": "nausea and vomiting",
    "abd pain": "abdominal pain",
}


def _normalize_symptom_token(term: str) -> str:
    """Normalize a single symptom term."""
    raw = (term or "").strip().lower()
    raw = re.sub(r"[^a-z0-9\s\-]", " ", raw)
    raw = re.sub(r"\s+", " ", raw).strip()
    if not raw:
        return ""

    # Check synonyms
    if raw in SYMPTOM_SYNONYMS:
        return SYMPTOM_SYNONYMS[raw]

    # Check canonical list
    if raw in SYMPTOM_CANONICAL:
        return raw

    # Fuzzy match
    close = difflib.get_close_matches(raw, SYMPTOM_CANONICAL, n=1, cutoff=0.74)
    if close:
        return close[0]

    return raw


def _normalize_symptoms(symptoms: str) -> List[str]:
    """Parse and normalize symptom string into list."""
    parts = re.split(r"[,;\n]", symptoms or "")
    cleaned = []
    for p in parts:
        t = _normalize_symptom_token(p)
        if t and t not in cleaned:
            cleaned.append(t)
    return cleaned


# =============================================================================
# QUERY BUILDING
# =============================================================================

def _build_ddx_queries(symptoms: List[str], duration: Optional[str]) -> List[str]:
    """
    Build multi-query set for DDx retrieval.

    Query A: Syndromic differential
    Query B: Red flags / must-not-miss
    Query C: Workup algorithm
    """
    base = " ".join(symptoms)
    if not base:
        base = "differential diagnosis"

    queries = [
        # Query A: Syndromic differential
        f"{base} differential diagnosis",
        f"{base} causes etiology",
        f"{base} evaluation approach",

        # Query B: Red flags / must-not-miss
        f"{base} red flags emergency",
        f"{base} must not miss life-threatening",
        f"{base} urgent causes",

        # Query C: Workup algorithm
        f"{base} workup investigation",
        f"{base} diagnostic algorithm",
        f"{base} initial assessment",
    ]

    # Add duration-specific query if provided
    if duration:
        dur_lower = duration.lower()
        if any(x in dur_lower for x in ["day", "hour", "acute"]):
            queries.append(f"{base} acute presentation")
        elif any(x in dur_lower for x in ["week", "month", "chronic"]):
            queries.append(f"{base} chronic causes")

    return list(dict.fromkeys([q for q in queries if q.strip()]))


# =============================================================================
# COLLECTION FILTERING
# =============================================================================

FORBIDDEN_IF_NOT_PREGNANT = [
    "pregnan", "gestation", "obstetric", "placenta", "aflp", "puerper",
]

FORBIDDEN_IF_NOT_PEDIATRIC = [
    "neonate", "infant", "pediatric", "paediatric",
]


def _collection_allowed(collection: str, age: Optional[int], pregnancy: str) -> bool:
    """Check if collection is appropriate for patient context."""
    col = (collection or "").lower()

    # Drug books shouldn't be primary for DDx
    if col in {"kd_tripathi", "tripathi", "drugs_mims_kd", "mims"}:
        return False

    # OBGYN only if pregnant
    if "obgyn" in col or "dutta" in col:
        if pregnancy not in {"yes", "true", "pregnant"}:
            return False

    # Pediatrics only if age < 16
    if "pediatric" in col:
        if age is None or age >= 16:
            return False

    return True


def _filter_by_context(
    chunks: List[Dict[str, Any]],
    age: Optional[int],
    pregnancy: str,
    symptoms: List[str],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Filter chunks by patient context."""
    kept = []
    dropped = []

    pregnancy_lower = (pregnancy or "").lower()
    is_pregnant = pregnancy_lower in {"yes", "true", "pregnant"}
    is_pediatric = age is not None and age < 16

    for chunk in chunks:
        text = (chunk.get("text") or "").lower()
        collection = chunk.get("collection") or ""
        reason = None

        # Check collection appropriateness
        if not _collection_allowed(collection, age, pregnancy_lower):
            reason = "collection_filtered"

        # Filter pregnancy content if not pregnant
        elif not is_pregnant and any(k in text for k in FORBIDDEN_IF_NOT_PREGNANT):
            reason = "pregnancy_filtered"

        # Filter pediatric content if not pediatric
        elif not is_pediatric and any(k in text for k in FORBIDDEN_IF_NOT_PEDIATRIC):
            reason = "pediatric_filtered"

        if reason:
            dropped.append({"chunk": chunk, "reason": reason})
        else:
            kept.append(chunk)

    return kept, dropped


# =============================================================================
# MAIN DDX FUNCTION
# =============================================================================

def run_ddx(payload: Dict[str, Any], debug: bool = False, timings: Optional[TimingContext] = None) -> Dict[str, Any]:
    """
    Run differential diagnosis for given symptoms and context.

    Args:
        payload: Dict with keys:
            - symptoms: str (comma-separated symptoms)
            - duration: str (optional)
            - age: int (optional)
            - sex: str
            - pregnancy: str
            - comorbidities: list[str]
            - meds: list[str]
        debug: bool - include debug info in response

    Returns:
        DDxResponse-compatible dict
    """
    start_total = time.monotonic()

    # Extract and normalize inputs
    symptoms_raw = payload.get("symptoms") or ""
    symptoms = _normalize_symptoms(symptoms_raw)
    duration = payload.get("duration") or ""
    age = payload.get("age")
    sex = (payload.get("sex") or "unknown").lower()
    pregnancy = (payload.get("pregnancy") or "unknown").lower()
    comorbidities = payload.get("comorbidities") or []
    meds = payload.get("meds") or []

    if not symptoms:
        result = _empty_ddx_response(payload, symptoms, "No symptoms provided")
        result["timings"] = {"retrieval_ms": 0, "llm_ms": 0, "total_ms": 0}
        if timings is not None:
            timings.set_duration("retrieval_ms", 0)
            timings.set_duration("llm_ms", 0)
        return result

    # Build queries
    queries = _build_ddx_queries(symptoms, duration)

    # Retrieve chunks
    retrieval_start = time.monotonic()
    all_chunks = []
    seen_ids: Set[str] = set()

    for query in queries:
        chunks = retrieve_chunks(query=query, collection_key="core_textbooks", top_k=12)
        for chunk in chunks:
            cid = chunk.get("chunk_id") or ""
            if cid and cid not in seen_ids:
                seen_ids.add(cid)
                all_chunks.append(chunk)

        # Stop if we have enough
        if len(all_chunks) >= 60:
            break
    retrieval_ms = (time.monotonic() - retrieval_start) * 1000

    # Filter by context (age, pregnancy, etc.)
    context_kept, context_dropped = _filter_by_context(
        all_chunks, age, pregnancy, symptoms
    )

    # Clean and filter chunks (garbage removal, deduplication, reranking)
    query_terms = symptoms + [duration] if duration else symptoms
    cleaned_chunks, cleaned_dropped = filter_and_clean_chunks(
        context_kept,
        feature="ddx",
        query_terms=query_terms,
        max_chunks=30,
    )

    # Sort by book priority (Harrison first)
    cleaned_chunks = sort_by_book_priority(cleaned_chunks)

    # Extract DDx using LLM
    llm_start = time.monotonic()
    result = extract_ddx_from_chunks(
        symptoms=symptoms,
        duration=duration,
        age=age,
        sex=sex,
        pregnancy=pregnancy,
        comorbidities=comorbidities,
        meds=meds,
        chunks=cleaned_chunks,
        debug=debug,
    )
    llm_ms = (time.monotonic() - llm_start) * 1000

    total_ms = (time.monotonic() - start_total) * 1000

    result["timings"] = {
        "retrieval_ms": round(retrieval_ms, 2),
        "llm_ms": round(llm_ms, 2),
        "total_ms": round(total_ms, 2),
    }
    if timings is not None:
        timings.set_duration("retrieval_ms", retrieval_ms)
        timings.set_duration("llm_ms", llm_ms)

    # Add debug info if requested
    if debug:
        debug_info = result.get("debug") or {}
        debug_info.update({
            "queries": queries,
            "retrieval": {
                "raw_count": len(all_chunks),
                "context_filtered": len(context_dropped),
                "garbage_filtered": len(cleaned_dropped),
                "final_count": len(cleaned_chunks),
                "context_dropped_reasons": _summarize_drop_reasons(context_dropped),
                "garbage_dropped_reasons": _summarize_drop_reasons(cleaned_dropped),
            },
            "normalized_symptoms": symptoms,
        })
        result["debug"] = debug_info

    return result


def _empty_ddx_response(
    payload: Dict[str, Any],
    symptoms: List[str],
    reason: str,
) -> Dict[str, Any]:
    """Return empty DDx response with explanation."""
    return {
        "input_summary": {
            "symptoms": payload.get("symptoms"),
            "duration": payload.get("duration"),
            "age": payload.get("age"),
            "sex": payload.get("sex"),
            "pregnancy": payload.get("pregnancy"),
            "comorbidities": payload.get("comorbidities") or [],
            "meds": payload.get("meds") or [],
            "normalized_symptoms": symptoms,
        },
        "must_not_miss": [],
        "ranked_ddx": [],
        "system_wise": [],
        "rapid_algorithm": {"step_1": [], "step_2": [], "step_3": []},
        "suggested_investigations": {"urgent": [], "soon": [], "routine": []},
        "red_flags": [reason],
        "evidence": [],
        "coverage_gate": {"passed": False, "missing_evidence_ids": ["no_symptoms"]},
    }


def _summarize_drop_reasons(dropped: List[Dict[str, Any]]) -> Dict[str, int]:
    """Summarize drop reasons for debug output."""
    counts: Dict[str, int] = {}
    for d in dropped:
        reason = d.get("reason") or "unknown"
        counts[reason] = counts.get(reason, 0) + 1
    return counts
