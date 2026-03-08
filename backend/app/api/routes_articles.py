# backend/app/api/routes_articles.py
# Clinova — SerpAPI Google Scholar proxy for "Latest Articles" panel
from __future__ import annotations

import os
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger("clinova.articles")

router = APIRouter()

SERP_API_KEY = os.getenv("SERP_API_KEY", "")
SERP_BASE = "https://serpapi.com/search.json"

# Result cap — Google Scholar returns up to 10 per page; we surface up to 6
MAX_RESULTS = 6


def _build_medical_query(topic: str) -> str:
    """
    Prefix topic with clinical context so Scholar results are medical-grade.
    E.g. "Dengue Fever" → "Dengue Fever clinical management treatment guidelines"
    """
    return f"{topic.strip()} clinical management treatment guidelines"


def _parse_article(raw: dict) -> dict:
    """Extract the fields we care about from a Google Scholar organic result."""
    pub_info = raw.get("publication_info", {})
    inline = raw.get("inline_links", {})
    cited = inline.get("cited_by", {})
    return {
        "title":       raw.get("title", ""),
        "link":        raw.get("link", ""),
        "snippet":     raw.get("snippet", ""),
        "authors":     pub_info.get("authors", []),
        "summary":     pub_info.get("summary", ""),  # "Journal · Year"
        "cited_by":    cited.get("total"),
        "result_id":   raw.get("result_id", ""),
    }


@router.get("/articles/search")
async def search_articles(
    q: str = Query(..., min_length=1, description="Medical topic to search for"),
    num: int = Query(MAX_RESULTS, ge=1, le=10, description="Number of results"),
):
    """
    Proxy to SerpAPI Google Scholar to fetch latest peer-reviewed articles for a topic.

    Returns:
        configured (bool): whether SERP_API_KEY is set
        articles (list): up to `num` article objects
    """
    if not SERP_API_KEY:
        # Graceful degradation — front end shows a "configure key" nudge
        return {"configured": False, "articles": [], "query": q}

    params = {
        "engine":  "google_scholar",
        "q":       _build_medical_query(q),
        "num":     min(num, MAX_RESULTS),
        "api_key": SERP_API_KEY,
        "hl":      "en",
        "as_ylo":  2020,   # articles from 2020 onwards for recency
        "scisbd":  1,      # sort by date (most recent first)
    }

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(SERP_BASE, params=params)
            resp.raise_for_status()
            data = resp.json()
    except httpx.TimeoutException:
        logger.warning("SerpAPI timeout for query: %s", q)
        raise HTTPException(status_code=504, detail="Article search timed out. Try again.")
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        logger.error("SerpAPI HTTP %s for query: %s", status, q)
        if status == 401:
            raise HTTPException(status_code=502, detail="Invalid SERP_API_KEY.")
        if status == 429:
            raise HTTPException(status_code=429, detail="SerpAPI rate limit reached.")
        raise HTTPException(status_code=502, detail="Article search service unavailable.")
    except Exception as exc:
        logger.exception("Unexpected error in article search: %s", exc)
        raise HTTPException(status_code=500, detail="Internal article search error.")

    organic = data.get("organic_results", [])
    articles = [_parse_article(r) for r in organic[:num]]

    return {
        "configured": True,
        "articles":   articles,
        "query":      q,
        "total":      len(articles),
    }
