# backend/app/api/topics.py
# Clinova — Structured topic content API (medical-grade content system)
from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger("clinova.topics")
router = APIRouter(prefix="/topics", tags=["topics"])

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "topics"
INDEX_PATH = DATA_DIR / "index.json"


# ─── Cached loaders ──────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _load_index() -> dict:
    if not INDEX_PATH.exists():
        return {"topics": []}
    with open(INDEX_PATH, encoding="utf-8") as f:
        return json.load(f)


def _load_topic(slug: str) -> dict:
    path = DATA_DIR / f"{slug}.json"
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Topic '{slug}' not found. Use POST /api/topics/generate to create it.",
        )
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _save_topic(slug: str, data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(DATA_DIR / f"{slug}.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _update_index(slug: str, data: dict) -> None:
    """Add or update a topic entry in index.json."""
    index = {"topics": []}
    if INDEX_PATH.exists():
        with open(INDEX_PATH, encoding="utf-8") as f:
            index = json.load(f)

    # Remove existing entry if present
    index["topics"] = [t for t in index["topics"] if t.get("slug") != slug]

    # Add updated entry
    index["topics"].append({
        "slug": slug,
        "title": data.get("title", slug.replace("_", " ").title()),
        "icd10": data.get("icd10", ""),
        "specialty": data.get("specialty", []),
        "tags": data.get("tags", []),
    })

    # Sort alphabetically by title
    index["topics"].sort(key=lambda t: t["title"])

    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)

    # Invalidate cache
    _load_index.cache_clear()


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("")
def list_topics():
    """List all available topics from the index."""
    return _load_index()


@router.get("/search")
def search_topics(q: str = Query(..., min_length=1, description="Search query")):
    """
    Search topics by title, tags, ICD-10 code, or specialty.
    Returns matching index entries (lightweight — no full content).
    """
    index = _load_index()
    q_lower = q.lower()

    results = []
    for topic in index.get("topics", []):
        score = 0
        if q_lower in topic.get("title", "").lower():
            score += 10
        if q_lower in topic.get("icd10", "").lower():
            score += 8
        if any(q_lower in s.lower() for s in topic.get("specialty", [])):
            score += 6
        if any(q_lower in tag.lower() for tag in topic.get("tags", [])):
            score += 4

        if score > 0:
            results.append({**topic, "_score": score})

    results.sort(key=lambda r: r["_score"], reverse=True)
    return {
        "query": q,
        "results": [{k: v for k, v in r.items() if k != "_score"} for r in results],
        "count": len(results),
    }


@router.get("/{slug}")
def get_topic(slug: str):
    """
    Return complete structured topic content by slug.
    Returns 404 with generation hint if topic doesn't exist yet.
    """
    return _load_topic(slug)


@router.delete("/{slug}")
def delete_topic(slug: str):
    """Delete a topic file and remove from index."""
    path = DATA_DIR / f"{slug}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Topic '{slug}' not found")
    path.unlink()

    # Remove from index
    if INDEX_PATH.exists():
        with open(INDEX_PATH, encoding="utf-8") as f:
            index = json.load(f)
        index["topics"] = [t for t in index["topics"] if t.get("slug") != slug]
        with open(INDEX_PATH, "w", encoding="utf-8") as f:
            json.dump(index, f, indent=2, ensure_ascii=False)
        _load_index.cache_clear()

    return {"success": True, "deleted": slug}
