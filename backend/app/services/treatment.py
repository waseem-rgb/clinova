# backend/app/services/treatment.py
"""
Treatment Advisor Service - Doctor Grade.

This module provides comprehensive treatment recommendations based on:
- Multi-query retrieval for core treatment, severity/setting, and special populations
- Book priority: Harrison/Oxford for treatment of choice, MIMS/Tripathi for dosing/brands
- Strict garbage filtering and deduplication
- LLM-based structured extraction (RAG-only, no hallucination)
- Coverage gating to ensure evidence-backed output
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Tuple

from app.rag.retrieve.query import retrieve_chunks
from app.rag.cleaners.text_cleaner import (
    filter_and_clean_chunks,
    sort_by_book_priority,
)
from app.rag.extractors.treatment_extractor import extract_treatment_from_chunks


# =============================================================================
# QUERY BUILDING
# =============================================================================

def _build_treatment_queries(topic: str, ctx: Dict[str, Any]) -> List[str]:
    """
    Build multi-query set for treatment retrieval.
    
    Query A: Core treatment / first-line regimen
    Query B: Severity/setting specific
    Query C: Special populations / contraindications
    """
    base = topic or "treatment"
    severity = (ctx.get("severity") or "").strip()
    setting = (ctx.get("setting") or "").strip()
    
    queries = [
        # Query A: Core treatment
        f"{base} treatment first line regimen dose duration",
        f"{base} treatment of choice recommended therapy",
        f"{base} management guideline",
        f"{base} pharmacological treatment",
        
        # Query B: Severity/setting
        f"{base} acute management",
        f"{base} initial therapy",
        
        # Query C: Special populations / contraindications
        f"{base} contraindications precautions",
        f"{base} pregnancy renal impairment hepatic",
        f"{base} monitoring follow-up",
    ]
    
    # Add severity-specific query
    if severity:
        queries.append(f"{base} {severity} treatment management")
    
    # Add setting-specific query
    if setting:
        setting_lower = setting.lower()
        if "icu" in setting_lower or "intensive" in setting_lower:
            queries.append(f"{base} ICU severe critical care")
        elif "er" in setting_lower or "emergency" in setting_lower:
            queries.append(f"{base} emergency acute management")
        else:
            queries.append(f"{base} {setting} management")
    
    return list(dict.fromkeys([q for q in queries if q.strip()]))


def _build_drug_queries(topic: str) -> List[str]:
    """Build queries for drug-specific information (dosing, brands)."""
    base = topic or "treatment"
    return [
        f"{base} dose dosing regimen",
        f"{base} drug formulation",
        f"{base} brand",
    ]


# =============================================================================
# RETRIEVAL
# =============================================================================

def _retrieve_with_priority(
    queries: List[str],
    drug_queries: List[str],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Retrieve chunks with book priority.
    - Core textbooks (Harrison/Oxford) for treatment recommendations
    - Drug books (MIMS/Tripathi) for dosing and brands
    """
    core_chunks: List[Dict[str, Any]] = []
    drug_chunks: List[Dict[str, Any]] = []
    seen_core: Set[str] = set()
    seen_drug: Set[str] = set()
    
    # Retrieve from core textbooks
    for query in queries:
        chunks = retrieve_chunks(query=query, collection_key="core_textbooks", top_k=10)
        for chunk in chunks:
            cid = chunk.get("chunk_id") or ""
            if cid and cid not in seen_core:
                seen_core.add(cid)
                core_chunks.append(chunk)
        
        if len(core_chunks) >= 40:
            break
    
    # Retrieve from drug books
    for query in drug_queries:
        chunks = retrieve_chunks(query=query, collection_key="drugs_mims", top_k=8)
        for chunk in chunks:
            cid = chunk.get("chunk_id") or ""
            if cid and cid not in seen_drug:
                seen_drug.add(cid)
                drug_chunks.append(chunk)
        
        if len(drug_chunks) >= 20:
            break
    
    return core_chunks, drug_chunks


# =============================================================================
# MAIN TREATMENT FUNCTION
# =============================================================================

def get_treatment_advice(payload: Dict[str, Any], debug: bool = False) -> Dict[str, Any]:
    """
    Get treatment advice for a given condition/diagnosis.
    
    Args:
        payload: Dict with keys:
            - topic_or_diagnosis: str (required)
            - context: dict with age, sex, pregnancy, severity, setting,
                      comorbidities, allergies, renal_status, hepatic_status, current_meds
            - confirmed_diagnosis: bool
            - source: str
        debug: bool - include debug info in response
    
    Returns:
        TreatmentAdvisorResponse-compatible dict
    """
    # Extract inputs
    topic = (payload.get("topic_or_diagnosis") or "").strip()
    ctx = payload.get("context") or {}
    
    age = ctx.get("age")
    sex = (ctx.get("sex") or "unknown").lower()
    pregnancy = (ctx.get("pregnancy") or "unknown").lower()
    severity = ctx.get("severity") or ""
    setting = ctx.get("setting") or ""
    comorbidities = ctx.get("comorbidities") or []
    allergies = ctx.get("allergies") or []
    renal_status = ctx.get("renal_status") or ""
    hepatic_status = ctx.get("hepatic_status") or ""
    current_meds = ctx.get("current_meds") or []
    
    if not topic:
        return _empty_treatment_response(topic, "No topic or diagnosis provided")
    
    # Build queries
    treatment_queries = _build_treatment_queries(topic, ctx)
    drug_queries = _build_drug_queries(topic)
    
    # Retrieve chunks
    core_raw, drug_raw = _retrieve_with_priority(treatment_queries, drug_queries)
    
    # Clean and filter core chunks
    query_terms = [topic] + topic.split()
    core_cleaned, core_dropped = filter_and_clean_chunks(
        core_raw,
        feature="treatment",
        query_terms=query_terms,
        max_chunks=25,
    )
    
    # Clean drug chunks (more lenient for drug books)
    drug_cleaned, drug_dropped = filter_and_clean_chunks(
        drug_raw,
        feature="treatment",
        query_terms=query_terms,
        max_chunks=15,
    )
    
    # Sort by book priority
    core_cleaned = sort_by_book_priority(core_cleaned)
    
    # Extract treatment using LLM
    result = extract_treatment_from_chunks(
        topic=topic,
        age=age,
        sex=sex,
        pregnancy=pregnancy,
        severity=severity,
        setting=setting,
        comorbidities=comorbidities,
        allergies=allergies,
        renal_status=renal_status,
        hepatic_status=hepatic_status,
        current_meds=current_meds,
        core_chunks=core_cleaned,
        drug_chunks=drug_cleaned,
        debug=debug,
    )
    
    # Add debug info if requested
    if debug:
        debug_info = result.get("debug") or {}
        debug_info.update({
            "queries": {
                "treatment": treatment_queries,
                "drug": drug_queries,
            },
            "retrieval": {
                "core_raw": len(core_raw),
                "core_cleaned": len(core_cleaned),
                "core_dropped": len(core_dropped),
                "drug_raw": len(drug_raw),
                "drug_cleaned": len(drug_cleaned),
                "drug_dropped": len(drug_dropped),
                "core_dropped_reasons": _summarize_drop_reasons(core_dropped),
                "drug_dropped_reasons": _summarize_drop_reasons(drug_dropped),
            },
            "input": {
                "topic": topic,
                "severity": severity,
                "setting": setting,
                "comorbidities": comorbidities,
                "allergies": allergies,
            },
        })
        result["debug"] = debug_info
    
    return result


def _empty_treatment_response(topic: str, reason: str) -> Dict[str, Any]:
    """Return empty treatment response with explanation."""
    return {
        "topic": topic,
        "summary_plan": [reason],
        "first_line_regimens": [],
        "second_line_regimens": [],
        "supportive_care": [],
        "contraindications_and_cautions": [],
        "monitoring": [],
        "drug_interactions_flags": [],
        "red_flags_urgent_referral": [],
        "follow_up": [],
        "brands_india": [],
        "evidence": {
            "chunks": [],
            "coverage": {"pass": False, "missing": ["topic"]},
        },
    }


def _summarize_drop_reasons(dropped: List[Dict[str, Any]]) -> Dict[str, int]:
    """Summarize drop reasons for debug output."""
    counts: Dict[str, int] = {}
    for d in dropped:
        reason = d.get("reason") or "unknown"
        counts[reason] = counts.get(reason, 0) + 1
    return counts
