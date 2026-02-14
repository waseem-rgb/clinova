# backend/app/api/routes_suggest.py
from __future__ import annotations

import difflib
import json
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Query
from pydantic import BaseModel

router = APIRouter(tags=["suggest"])

DEFAULT_INDEX_PATH = Path(__file__).resolve().parents[1] / "data" / "topic_index_harrison.json"


class SuggestResponse(BaseModel):
    suggestions: List[str]


class DebugIndexResponse(BaseModel):
    resolved_path: str
    exists: bool
    loaded_item_count: int
    detected_top_level_type: str
    detected_keys: List[str]
    first_entry_preview: str
    sample_titles: List[str]
    sample_query: str
    sample_matches: List[str]
    note: Optional[str] = None


@dataclass(frozen=True)
class IndexItem:
    title_raw: str
    title_norm: str
    display: str
    chunk_count: int


def _normalize(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s


def _clean_display_title(title: str) -> str:
    """
    Clean index-like strings to doctor-friendly topic titles.
    Removes page markers, index artifacts, and ensures complete terms.
    """
    t = (title or "").strip()
    
    # Remove trailing commas/spaces
    t = re.sub(r"[,\s]+$", "", t)
    
    # Remove trailing page markers like " , 123t" or ", 2786f"
    t = re.sub(r"\s*,\s*\d+[a-z]?\s*$", "", t, flags=re.IGNORECASE)
    
    # Remove embedded page markers like "3412t", "2786f"
    t = re.sub(r"\b\d{3,4}[tf]\b", "", t)
    
    # Remove page ranges like "123-456"
    t = re.sub(r"\b\d{3,4}[-–]\d{3,4}\b", "", t)
    
    # Remove standalone page numbers
    t = re.sub(r"\b\d{3,4}\b(?!\s*(mg|g|mcg|ml|kg|cm|mm))", "", t)
    
    # Clean up multiple commas/spaces caused by removals
    t = re.sub(r"\s*,\s*,+", ", ", t)
    t = re.sub(r",\s*$", "", t)
    
    # Fix patterns like "epidemiology of, Schnitzler's syndrome"
    t = re.sub(r"\bof,\s+", "of ", t)
    t = re.sub(r"\bfor,\s+", "for ", t)
    t = re.sub(r"\bin,\s+", "in ", t)
    
    # Drop dangling stopwords (e.g., "hypercalcemia in")
    stopwords = {"in", "of", "for", "and", "or", "with", "without", "to", "from", "by", "on", "at"}
    parts = t.split()
    while parts and parts[-1].lower() in stopwords:
        parts = parts[:-1]
    t = " ".join(parts).strip()
    
    # Remove dangling punctuation/brackets after trimming
    t = re.sub(r"[\s\-\–\(\)\[\]/]+$", "", t).strip()
    t = re.sub(r"\s+", " ", t).strip()
    
    # Reject if too short
    if len(t) < 3:
        return ""
    
    # Reject if looks like an index entry (mostly commas and numbers)
    comma_count = t.count(",")
    if comma_count >= 3 and len(t) < 50:
        return ""
    
    # Reject if starts with lowercase and isn't a known pattern
    # (indicates truncated entry like "hortness of breath")
    if t and t[0].islower() and not t.startswith("of ") and not t.startswith("in "):
        # Check if first word is a valid medical prefix
        first_word = t.split()[0] if t.split() else ""
        valid_prefixes = {"acute", "chronic", "sub", "anti", "hyper", "hypo", "pre", "post", "neo", "meta"}
        if first_word.lower() not in valid_prefixes and len(first_word) < 4:
            return ""
    
    return t


def _coerce_list(x: Any) -> List[Any]:
    if x is None:
        return []
    if isinstance(x, list):
        return x
    if isinstance(x, tuple):
        return list(x)
    if isinstance(x, dict):
        return list(x.keys())
    return []


def _extract_chunk_count(meta: Any) -> int:
    if not isinstance(meta, dict):
        return 0

    # Direct numeric hints
    for k in ("chunk_count", "chunks", "n_chunks", "chunkCount", "chunk_count_est"):
        v = meta.get(k)
        if isinstance(v, int):
            return v
        if isinstance(v, str) and v.isdigit():
            return int(v)

    # chunk_ids / ids arrays
    for k in ("chunk_ids", "chunkIds", "chunks_ids", "chunk_ids_list", "ids", "doc_ids"):
        v = meta.get(k)
        if v is not None:
            return len(_coerce_list(v))

    # sometimes stored under meta["match"]["chunk_ids"]
    m = meta.get("match")
    if isinstance(m, dict):
        for k in ("chunk_ids", "ids"):
            v = m.get(k)
            if v is not None:
                return len(_coerce_list(v))

    return 0


def _unwrap_container(obj: Any) -> Any:
    """
    Unwrap common container keys:
      {"topics": [...]}
      {"items": ...}
      {"index": ...}
      {"entries": ...}
      {"data": ...}
      {"payload": ...}
    """
    if not isinstance(obj, dict):
        return obj

    for _ in range(3):
        if not isinstance(obj, dict):
            break
        for k in ("topics", "items", "index", "entries", "data", "payload"):
            if k in obj:
                obj = obj[k]
                break
        else:
            break
    return obj


def _title_from_row(row: Dict[str, Any]) -> Optional[str]:
    # ✅ Your file uses display_title, so it must be supported.
    return (
        row.get("display_title")
        or row.get("displayTitle")
        or row.get("title")
        or row.get("name")
        or row.get("topic")
        or row.get("heading")
    )


def _parse_index_json(obj: Any) -> List[IndexItem]:
    """
    Accept many shapes, including:
      A) dict: { "Topic title": {...meta...}, ... }
      B) dict container: {"topics": {...}} or {"entries":[...]}
      C) list of dicts: [ {"display_title": "...", ...}, ... ]
      D) list of strings: [ "Epilepsy", ... ]
      E) list of pairs: [ ["Epilepsy", {...}], ["Asthma", {...}] ]
      F) dict with numeric keys: {"0": {"display_title": ...}, "1": {...}}
    """
    obj = _unwrap_container(obj)

    pairs: List[Tuple[str, Dict[str, Any]]] = []

    # dict forms
    if isinstance(obj, dict):
        numeric_like = 0
        total = 0
        for k in obj.keys():
            total += 1
            if isinstance(k, str) and k.isdigit():
                numeric_like += 1

        if total > 0 and numeric_like / max(total, 1) > 0.7:
            # likely {"0": {...}, "1": {...}}
            for v in obj.values():
                if isinstance(v, dict):
                    title = _title_from_row(v)
                    if title:
                        pairs.append((str(title), v))
        else:
            # classic {title -> meta}
            for title, meta in obj.items():
                if isinstance(meta, dict):
                    pairs.append((str(title), meta))
                elif isinstance(meta, list) and meta and all(isinstance(x, (int, str)) for x in meta):
                    pairs.append((str(title), {"pages": meta}))
                else:
                    pairs.append((str(title), {}))

    # list forms
    elif isinstance(obj, list):
        for row in obj:
            if isinstance(row, str):
                pairs.append((row, {}))
            elif isinstance(row, dict):
                title = _title_from_row(row)
                if not title:
                    continue
                pairs.append((str(title), row))
            elif isinstance(row, list) and len(row) >= 1:
                t0 = row[0]
                if isinstance(t0, str):
                    meta = row[1] if len(row) > 1 and isinstance(row[1], dict) else {}
                    pairs.append((t0, meta))
    else:
        return []

    out: List[IndexItem] = []
    for title, meta in pairs:
        display = _clean_display_title(title)
        if not display:
            continue
        norm = _normalize(display)
        chunk_count = _extract_chunk_count(meta)
        out.append(IndexItem(title_raw=title, title_norm=norm, display=display, chunk_count=chunk_count))

    # De-duplicate by display title, keep max chunk_count
    best: Dict[str, IndexItem] = {}
    for it in out:
        prev = best.get(it.display)
        if prev is None or it.chunk_count > prev.chunk_count:
            best[it.display] = it

    return list(best.values())


def _resolve_index_path() -> Path:
    p = os.environ.get("TOPIC_INDEX_HARRISON_JSON", "").strip()
    if p:
        return Path(p).expanduser().resolve()
    return DEFAULT_INDEX_PATH.resolve()


@lru_cache(maxsize=1)
def _load_harrison_index() -> Tuple[Path, List[IndexItem], str, List[str], str]:
    """
    Returns:
      path, items, top_level_type, detected_keys, first_entry_preview
    """
    path = _resolve_index_path()
    if not path.exists():
        return path, [], "missing", [], ""

    raw = path.read_bytes()
    # Strip UTF-8 BOM if present
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]

    text = raw.decode("utf-8", errors="ignore").strip()
    if not text:
        return path, [], "empty", [], ""

    first_preview = text[:400].replace("\n", "\\n")

    data = json.loads(text)

    top_type = type(data).__name__
    keys: List[str] = []
    if isinstance(data, dict):
        keys = list(data.keys())[:20]

    items = _parse_index_json(data)
    return path, items, top_type, keys, first_preview


def _match_score(q: str, title_norm: str) -> Tuple[int, int]:
    if not q:
        return (0, 10**9)
    if title_norm.startswith(q):
        return (1, 0)
    pos = title_norm.find(q)
    return (0, pos if pos >= 0 else 10**9)


def _suggest_titles(q: str, limit: int, min_chunks: int) -> List[str]:
    _, items, _, _, _ = _load_harrison_index()
    if not items:
        return []
    qn = _normalize(q)
    if not qn:
        return []

    filtered = [it for it in items if it.chunk_count >= min_chunks]
    matches = [it for it in filtered if qn in it.title_norm]

    matches.sort(
        key=lambda it: (
            -_match_score(qn, it.title_norm)[0],  # prefix first
            _match_score(qn, it.title_norm)[1],   # earlier match first
            -it.chunk_count,                      # more coverage first
            len(it.display),                      # shorter first
            it.display.lower(),
        )
    )

    if matches:
        return [it.display for it in matches[:limit]]

    close = difflib.get_close_matches(qn, [it.title_norm for it in filtered], n=limit, cutoff=0.7)
    if close:
        picked = [it.display for it in filtered if it.title_norm in close]
        return picked[:limit]

    return []


@router.get("/suggest/medicine", response_model=SuggestResponse)
def suggest_medicine(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
    min_chunks: int = Query(30, ge=0, le=5000),
) -> SuggestResponse:
    return SuggestResponse(suggestions=_suggest_titles(q=q, limit=limit, min_chunks=min_chunks))


@router.get("/_debug/harrison_index", response_model=DebugIndexResponse)
def debug_harrison_index(q: str = "epi") -> DebugIndexResponse:
    path, items, top_type, keys, first_preview = _load_harrison_index()

    sample_titles = [it.display for it in items[:20]]
    sample_matches = _suggest_titles(q=q, limit=20, min_chunks=30)

    note = None
    if path.exists() and len(items) == 0:
        note = "File exists but parsed item_count is 0. JSON shape is not being recognized."

    return DebugIndexResponse(
        resolved_path=str(path),
        exists=path.exists(),
        loaded_item_count=len(items),
        detected_top_level_type=top_type,
        detected_keys=[str(k) for k in keys],
        first_entry_preview=first_preview,
        sample_titles=sample_titles,
        sample_query=q,
        sample_matches=sample_matches,
        note=note,
    )
