# backend/app/services/interactions.py
"""
Drug Interactions Service - Doctor Grade with CACHING.

This module provides comprehensive drug interaction checking based on:
- Pairwise retrieval for each drug combination
- Individual drug interaction profiles
- Rule-based risk cluster detection (QT, bleeding, serotonin, etc.)
- LLM-based structured extraction (RAG-only, no hallucination)
- RESULT CACHING (6 hours) for performance
"""
from __future__ import annotations

import time
from itertools import combinations
from typing import Any, Dict, List, Optional, Set

from app.rag.retrieve.query import retrieve_chunks
from app.rag.cleaners.text_cleaner import (
    filter_and_clean_chunks,
    sort_by_book_priority,
)
from app.rag.extractors.drug_interactions_extractor import extract_interactions_from_chunks
from app.services.service_cache import (
    get_interactions_cached,
    set_interactions_cached,
)
from app.services.timing import TimingContext


# =============================================================================
# QUERY BUILDING
# =============================================================================

def _build_interaction_queries(drugs: List[str]) -> List[str]:
    """
    Build queries for interaction retrieval.

    Includes:
    - Pairwise interaction queries
    - Individual drug interaction profiles
    """
    queries = []

    # Pairwise interaction queries
    for a, b in combinations(drugs, 2):
        queries.append(f"{a} {b} interaction")
        queries.append(f"{a} {b} drug interaction contraindicated")

    # Individual drug interaction profiles
    for drug in drugs:
        queries.append(f"{drug} drug interaction")
        queries.append(f"{drug} contraindicated avoid combination")

    return list(dict.fromkeys(queries))


# =============================================================================
# RETRIEVAL
# =============================================================================

def _retrieve_interaction_chunks(drugs: List[str]) -> List[Dict[str, Any]]:
    """
    Retrieve interaction-related chunks.

    Prioritizes drug books (MIMS, Tripathi) for interaction data.
    """
    queries = _build_interaction_queries(drugs)

    all_chunks: List[Dict[str, Any]] = []
    seen_ids: Set[str] = set()

    # Retrieve from drug books first
    for query in queries[:12]:  # Limit queries
        chunks = retrieve_chunks(query=query, collection_key="drugs_mims", top_k=6)
        for chunk in chunks:
            cid = chunk.get("chunk_id") or ""
            if cid and cid not in seen_ids:
                seen_ids.add(cid)
                all_chunks.append(chunk)

        if len(all_chunks) >= 30:
            break

    # Also check clinical textbooks for major interactions
    if len(all_chunks) < 20:
        for query in queries[:6]:
            chunks = retrieve_chunks(query=query, collection_key="core_textbooks", top_k=4)
            for chunk in chunks:
                cid = chunk.get("chunk_id") or ""
                if cid and cid not in seen_ids:
                    seen_ids.add(cid)
                    all_chunks.append(chunk)

            if len(all_chunks) >= 40:
                break

    return all_chunks


# =============================================================================
# MAIN INTERACTION CHECK FUNCTION (WITH CACHING)
# =============================================================================

def check_interactions(payload: Dict[str, Any], debug: bool = False, timings: Optional[TimingContext] = None) -> Dict[str, Any]:
    """
    Check drug interactions for a list of drugs with caching.

    Args:
        payload: Dict with keys:
            - drugs: list[str] (required, at least 2)
            - context: dict (optional) with age, pregnancy, renal_status, comorbidities
        debug: Include debug info

    Returns:
        InteractionResponse-compatible dict with timings
    """
    start_time = time.monotonic()
    cache_hit = False

    drugs = payload.get("drugs") or []
    context = payload.get("context") or {}

    # Validate input
    if not drugs:
        return _empty_response([], "No drugs provided")

    if len(drugs) < 2:
        return _empty_response(drugs, "Need at least 2 drugs to check interactions")

    # Normalize drug names
    drugs = [d.strip() for d in drugs if d and d.strip()]
    drugs = drugs[:10]  # Limit to 10 drugs max

    # Check cache first (skip if debug mode)
    if not debug:
        cached = get_interactions_cached(drugs=drugs, context=context)
        if cached is not None:
            cache_hit = True
            # Add timing info to cached result
            cached_result = dict(cached)
            cached_result["timings"] = {
                "cache_hit": True,
                "total_ms": round((time.monotonic() - start_time) * 1000, 2),
            }
            if timings is not None:
                timings.set_duration("retrieval_ms", 0)
                timings.set_duration("llm_ms", 0)
            return cached_result

    # Extract context
    age = context.get("age")
    pregnancy = context.get("pregnancy")
    renal_status = context.get("renal_status")
    comorbidities = context.get("comorbidities") or []

    # Retrieve chunks
    retrieval_start = time.monotonic()
    raw_chunks = _retrieve_interaction_chunks(drugs)
    retrieval_ms = (time.monotonic() - retrieval_start) * 1000

    # Clean and filter
    clean_start = time.monotonic()
    query_terms = drugs + ["interaction", "contraindicated"]
    cleaned_chunks, dropped = filter_and_clean_chunks(
        raw_chunks,
        feature="interaction",
        query_terms=query_terms,
        max_chunks=25,
    )

    # Sort by book priority (drug books first)
    cleaned_chunks = sort_by_book_priority(cleaned_chunks, feature="drug")
    clean_ms = (time.monotonic() - clean_start) * 1000

    # Extract interactions using LLM
    llm_start = time.monotonic()
    result = extract_interactions_from_chunks(
        drugs=drugs,
        age=age,
        pregnancy=pregnancy,
        renal_status=renal_status,
        comorbidities=comorbidities,
        chunks=cleaned_chunks,
        debug=debug,
    )
    llm_ms = (time.monotonic() - llm_start) * 1000

    total_ms = (time.monotonic() - start_time) * 1000

    # Add timing info
    result["timings"] = {
        "cache_hit": cache_hit,
        "retrieval_ms": round(retrieval_ms, 2),
        "clean_ms": round(clean_ms, 2),
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
            "queries": _build_interaction_queries(drugs)[:10],
            "retrieval": {
                "raw_count": len(raw_chunks),
                "cleaned_count": len(cleaned_chunks),
                "dropped_count": len(dropped),
            },
        })
        result["debug"] = debug_info
    else:
        # Cache the result for future requests (only in non-debug mode)
        set_interactions_cached(drugs=drugs, result=result, context=context)

    return result


def _empty_response(drugs: List[str], reason: str) -> Dict[str, Any]:
    """Return empty response with explanation."""
    return {
        "drugs": drugs,
        "drugs_resolved": [{"input": d, "resolved_generic": d} for d in drugs],
        "overall_risk_level": "Not assessed",
        "summary": reason,
        "interactions": [],
        "combined_risks": [],
        "monitoring": [],
        "safer_alternatives": [],
        "evidence": [],
        "coverage_gate": {"passed": False, "missing_chunk_ids": []},
        "timings": {"cache_hit": False, "total_ms": 0},
    }


# =============================================================================
# QUICK CHECK (for inline warnings in other features)
# =============================================================================

def quick_interaction_check(drugs: List[str]) -> List[Dict[str, str]]:
    """
    Quick interaction check for inline warnings.
    Uses rule-based detection only, no LLM call.

    Args:
        drugs: List of drug names

    Returns:
        List of {drug, message} warnings
    """
    from app.rag.extractors.drug_interactions_extractor import RISK_CLUSTERS

    warnings = []
    drugs_lower = [d.lower() for d in drugs if d]

    if len(drugs_lower) < 2:
        return warnings

    for cluster_name, cluster_info in RISK_CLUSTERS.items():
        cluster_drugs = cluster_info["drugs"]
        matched = []

        for drug in drugs_lower:
            for cluster_drug in cluster_drugs:
                if cluster_drug in drug:
                    matched.append(drug)

        if len(matched) >= 2:
            msg = cluster_info.get("message") or "Potential interaction risk"
            for drug in matched:
                warnings.append({"drug": drug, "message": msg})

    return warnings
