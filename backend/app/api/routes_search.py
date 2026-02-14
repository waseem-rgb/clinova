from __future__ import annotations

from fastapi import APIRouter, Query

from app.services.topics import suggest_topics

router = APIRouter()


@router.get("/search/suggest")
async def search_suggest(q: str = Query("", min_length=1)):
    return {"query": q, "results": suggest_topics(q)}
