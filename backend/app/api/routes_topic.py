# backend/app/api/routes_topic.py
from __future__ import annotations

from fastapi import APIRouter, Query, Response

from app.services.topics import get_topic

router = APIRouter(tags=["topic"])


def _add_timing_headers(response: Response, result: dict) -> None:
    """Add X-Cache and X-Topic-Time headers to response."""
    timings = result.get("timings", {})
    cache_hit = timings.get("cache_hit", {})
    
    # Determine cache status
    if cache_hit.get("topic"):
        cache_status = "HIT"
    elif cache_hit.get("transform"):
        cache_status = "PARTIAL"
    elif cache_hit.get("evidence"):
        cache_status = "EVIDENCE-HIT"
    else:
        cache_status = "MISS"
    
    response.headers["X-Cache"] = cache_status
    response.headers["X-Topic-Time"] = str(int(timings.get("total_ms", 0)))
    response.headers["X-Retrieval-Time"] = str(int(timings.get("retrieval_ms", 0)))
    response.headers["X-LLM-Time"] = str(int(timings.get("llm_ms", 0)))


@router.get("/topic/{topic_id}")
async def topic_get(topic_id: str, response: Response, debug: bool = Query(False)):
    """Get topic by ID (legacy route)."""
    result = await get_topic(topic_id, debug=debug)
    _add_timing_headers(response, result)
    return result


@router.get("/topic/medicine")
async def topic_medicine(response: Response, q: str = Query(""), debug: bool = Query(False)):
    """Get medicine topic."""
    topic_id = q or "medicine"
    result = await get_topic(topic_id, debug=debug)
    _add_timing_headers(response, result)
    return result


@router.get("/topic/obgyn")
async def topic_obgyn(response: Response, q: str = Query(""), debug: bool = Query(False)):
    """Get OBGYN topic."""
    topic_id = q or "obgyn"
    result = await get_topic(topic_id, debug=debug)
    _add_timing_headers(response, result)
    return result


@router.get("/topic/pediatrics")
async def topic_pediatrics(response: Response, q: str = Query(""), debug: bool = Query(False)):
    """Get pediatrics topic."""
    topic_id = q or "pediatrics"
    result = await get_topic(topic_id, debug=debug)
    _add_timing_headers(response, result)
    return result


@router.get("/topic/surgery")
async def topic_surgery(response: Response, q: str = Query(""), debug: bool = Query(False)):
    """Get surgery topic."""
    topic_id = q or "surgery"
    result = await get_topic(topic_id, debug=debug)
    _add_timing_headers(response, result)
    return result
