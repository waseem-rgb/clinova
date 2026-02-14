from __future__ import annotations

from fastapi import APIRouter, Query, Response

from app.api.schemas import DrugDetailsResponse, DrugResolveResponse, DrugSearchResponse
from app.services.drugs_catalog import resolve_name, search_suggestions
from app.services.drugs_details import get_drug_details

router = APIRouter(tags=["drugs"])


def _add_timing_headers(response: Response, result: dict) -> None:
    """Add timing and cache headers to response."""
    timings = result.get("timings", {})
    
    # Cache status
    cache_hit = timings.get("cache_hit", False)
    response.headers["X-Cache"] = "HIT" if cache_hit else "MISS"
    
    # Timing headers
    response.headers["X-Time-Total-ms"] = str(int(timings.get("total_ms", 0)))
    response.headers["X-Time-LLM-ms"] = str(int(timings.get("llm_ms", 0)))
    response.headers["X-Time-Retrieve-ms"] = str(int(timings.get("retrieval_ms", 0)))


@router.get("/drugs/search", response_model=DrugSearchResponse)
async def drugs_search(q: str = Query("", min_length=1)):
    return DrugSearchResponse(query=q, suggestions=search_suggestions(q, limit=12))


@router.get("/drugs/resolve", response_model=DrugResolveResponse)
async def drugs_resolve(name: str = Query("", min_length=1)):
    resolved = resolve_name(name)
    return DrugResolveResponse(
        query=name,
        canonical=resolved.get("canonical") or name,
        matched=resolved.get("matched") or name,
        confidence=resolved.get("confidence") or 0.0,
    )


@router.get("/drugs/{name}", response_model=DrugDetailsResponse)
async def drugs_detail(name: str, response: Response, debug: bool = Query(False)):
    result = get_drug_details(name, debug=debug)
    _add_timing_headers(response, result)
    return result
