# backend/app/services/drugs_details.py
"""
Drug Details Service - Doctor Grade with CACHING.

This module provides comprehensive drug information based on:
- Multi-query retrieval for mechanism, dosing, safety, and brands
- Book priority: MIMS/Tripathi for drug specifics, Harrison/Oxford for clinical context
- Strict garbage filtering
- LLM-based structured extraction (RAG-only, no hallucination)
- RESULT CACHING (6 hours) for performance
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Set

from app.rag.retrieve.query import retrieve_chunks
from app.rag.cleaners.text_cleaner import (
    filter_and_clean_chunks,
    sort_by_book_priority,
)
from app.rag.extractors.drug_details_extractor import extract_drug_details_from_chunks
from app.services.drugs_catalog import resolve_name
from app.services.service_cache import (
    get_drug_details_cached,
    set_drug_details_cached,
)


# =============================================================================
# QUERY BUILDING
# =============================================================================

def _build_drug_queries(drug_name: str) -> Dict[str, List[str]]:
    """
    Build multi-query set for drug retrieval.
    
    Returns dict with keys:
        - 'mims': queries for drug books (dosing, brands, formulations)
        - 'clinical': queries for clinical textbooks (mechanism, indications)
    """
    base = drug_name or "drug"
    
    mims_queries = [
        f"{base}",
        f"{base} dose dosing",
        f"{base} tablet capsule injection formulation",
        f"{base} brand india",
        f"{base} adverse effect side effect",
        f"{base} contraindication",
    ]
    
    clinical_queries = [
        f"{base} mechanism of action pharmacology",
        f"{base} indication use",
        f"{base} contraindication adverse effect",
        f"{base} renal hepatic impairment",
        f"{base} pregnancy lactation",
        f"{base} monitoring",
    ]
    
    return {
        "mims": list(dict.fromkeys([q for q in mims_queries if q.strip()])),
        "clinical": list(dict.fromkeys([q for q in clinical_queries if q.strip()])),
    }


# =============================================================================
# RETRIEVAL
# =============================================================================

def _retrieve_drug_chunks(
    drug_name: str,
    canonical_name: str,
) -> tuple:
    """
    Retrieve chunks from both drug books and clinical textbooks.
    
    Returns:
        (mims_chunks, clinical_chunks)
    """
    queries = _build_drug_queries(canonical_name or drug_name)
    
    mims_chunks: List[Dict[str, Any]] = []
    clinical_chunks: List[Dict[str, Any]] = []
    seen_mims: Set[str] = set()
    seen_clinical: Set[str] = set()
    
    # Retrieve from drug books (MIMS, Tripathi)
    for query in queries["mims"]:
        chunks = retrieve_chunks(query=query, collection_key="drugs_mims", top_k=10)
        for chunk in chunks:
            cid = chunk.get("chunk_id") or ""
            if cid and cid not in seen_mims:
                seen_mims.add(cid)
                mims_chunks.append(chunk)
        
        if len(mims_chunks) >= 25:
            break
    
    # Also try with original name if different
    if drug_name.lower() != canonical_name.lower():
        for query in [drug_name, f"{drug_name} dose", f"{drug_name} brand"]:
            chunks = retrieve_chunks(query=query, collection_key="drugs_mims", top_k=6)
            for chunk in chunks:
                cid = chunk.get("chunk_id") or ""
                if cid and cid not in seen_mims:
                    seen_mims.add(cid)
                    mims_chunks.append(chunk)
    
    # Retrieve from clinical textbooks (for mechanism, clinical context)
    for query in queries["clinical"]:
        chunks = retrieve_chunks(query=query, collection_key="core_textbooks", top_k=6)
        for chunk in chunks:
            cid = chunk.get("chunk_id") or ""
            if cid and cid not in seen_clinical:
                seen_clinical.add(cid)
                clinical_chunks.append(chunk)
        
        if len(clinical_chunks) >= 15:
            break
    
    return mims_chunks, clinical_chunks


# =============================================================================
# MAIN DRUG DETAILS FUNCTION (WITH CACHING)
# =============================================================================

def get_drug_details(
    name: str,
    age: Optional[int] = None,
    pregnancy: Optional[str] = None,
    renal_status: Optional[str] = None,
    hepatic_status: Optional[str] = None,
    debug: bool = False,
) -> Dict[str, Any]:
    """
    Get comprehensive drug details with caching.
    
    Args:
        name: Drug name (generic or brand)
        age: Patient age (optional context)
        pregnancy: Pregnancy status
        renal_status: Renal function status
        hepatic_status: Hepatic function status
        debug: Include debug info
    
    Returns:
        DrugDetailsResponse-compatible dict with timings
    """
    start_time = time.monotonic()
    cache_hit = False
    
    # Check cache first (skip if debug mode)
    if not debug:
        cached = get_drug_details_cached(
            drug_name=name,
            age=age,
            pregnancy=pregnancy,
            renal_status=renal_status,
            hepatic_status=hepatic_status,
        )
        if cached is not None:
            cache_hit = True
            # Add timing info to cached result
            cached_result = dict(cached)
            cached_result["timings"] = {
                "cache_hit": True,
                "total_ms": round((time.monotonic() - start_time) * 1000, 2),
            }
            return cached_result
    
    # Resolve drug name
    resolve_start = time.monotonic()
    resolved = resolve_name(name)
    canonical = resolved.get("canonical") or name
    resolve_ms = (time.monotonic() - resolve_start) * 1000
    
    # Retrieve chunks
    retrieval_start = time.monotonic()
    mims_raw, clinical_raw = _retrieve_drug_chunks(name, canonical)
    retrieval_ms = (time.monotonic() - retrieval_start) * 1000
    
    # Combine all chunks
    all_raw = mims_raw + clinical_raw
    
    # Clean and filter chunks
    clean_start = time.monotonic()
    query_terms = [canonical, name] + canonical.split()
    cleaned_chunks, dropped = filter_and_clean_chunks(
        all_raw,
        feature="drug",
        query_terms=query_terms,
        max_chunks=30,
    )
    
    # Sort by book priority (drug books first for drug details)
    cleaned_chunks = sort_by_book_priority(cleaned_chunks, feature="drug")
    clean_ms = (time.monotonic() - clean_start) * 1000
    
    # Extract drug details using LLM
    llm_start = time.monotonic()
    result = extract_drug_details_from_chunks(
        drug_name=canonical,
        age=age,
        pregnancy=pregnancy,
        renal_status=renal_status,
        hepatic_status=hepatic_status,
        chunks=cleaned_chunks,
        debug=debug,
    )
    llm_ms = (time.monotonic() - llm_start) * 1000
    
    total_ms = (time.monotonic() - start_time) * 1000
    
    # Add timing info
    result["timings"] = {
        "cache_hit": cache_hit,
        "resolve_ms": round(resolve_ms, 2),
        "retrieval_ms": round(retrieval_ms, 2),
        "clean_ms": round(clean_ms, 2),
        "llm_ms": round(llm_ms, 2),
        "total_ms": round(total_ms, 2),
    }
    
    # Add debug info if requested
    if debug:
        debug_info = result.get("debug") or {}
        debug_info.update({
            "resolved_name": resolved,
            "queries": _build_drug_queries(canonical),
            "retrieval": {
                "mims_raw": len(mims_raw),
                "clinical_raw": len(clinical_raw),
                "total_raw": len(all_raw),
                "after_cleaning": len(cleaned_chunks),
                "dropped_count": len(dropped),
            },
        })
        result["debug"] = debug_info
    else:
        # Cache the result for future requests (only in non-debug mode)
        set_drug_details_cached(
            drug_name=name,
            result=result,
            age=age,
            pregnancy=pregnancy,
            renal_status=renal_status,
            hepatic_status=hepatic_status,
        )
    
    return result


# =============================================================================
# BACKWARD COMPATIBILITY - keep old function signature working
# =============================================================================

def get_drug_monograph(name: str, debug: bool = False) -> Dict[str, Any]:
    """Alias for get_drug_details for backward compatibility."""
    return get_drug_details(name, debug=debug)
