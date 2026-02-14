from __future__ import annotations

import json
import os
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import chromadb

OUT_PATH = Path("app/data/topic_index_harrison.json")

CHROMA_DIR = os.getenv("CHROMA_DIR", "app/data/chroma")
COLLECTION = "medicine_harrison"

# These are NOT "topics" (they are section headings)
GENERIC_HEADINGS = {
    "epidemiology",
    "definition",
    "pathogenesis",
    "etiology",
    "clinical features",
    "clinical manifestations",
    "diagnosis",
    "differential diagnosis",
    "treatment",
    "management",
    "prevention",
    "complications",
    "prognosis",
    "approach",
    "classification",
    "laboratory findings",
    "imaging",
    "introduction",
    "key points",
    "summary",
    "natural history",
    "risk factors",
    "pathophysiology",
}


def norm_space(s: str) -> str:
    return " ".join((s or "").strip().split())


def strip_index_noise(s: str) -> str:
    s = norm_space(s)

    # Remove "See also ..." tail
    s = re.sub(r"\bSee also\b.*$", "", s, flags=re.IGNORECASE).strip()

    # Remove trailing page numbers like ", 3408" or " 3408, 3410"
    s = re.sub(r"(,?\s*\d{1,4}(\s*,\s*\d{1,4})*)$", "", s).strip()

    # Remove trailing punctuation
    s = s.rstrip(" ,;:-").strip()

    return s


def looks_like_heading(s: str) -> bool:
    s = s.strip()
    if len(s) < 3 or len(s) > 80:
        return False

    # Reject lines with too many commas/semicolons (usually sentence fragments)
    if s.count(",") >= 2 or ";" in s:
        return False

    # Reject sentence-like lines (periods)
    if "." in s:
        return False

    # Reject lines with many words (avoid sentences)
    if len(s.split()) > 7:
        return False

    # Reject generic headings
    if s.lower() in GENERIC_HEADINGS:
        return False

    # Reject "of ..." fragments
    if s.lower().startswith(("of ", "in ", "and ", "the ")):
        return False

    # Reject very numeric
    if sum(ch.isdigit() for ch in s) >= 3:
        return False

    return True


def normalize_title(s: str) -> Optional[str]:
    s = strip_index_noise(s)

    # If ALLCAPS and long, it’s often a heading; keep but still validate
    # Avoid turning acronyms into title case
    if not looks_like_heading(s):
        return None

    # Light normalization: collapse multiple spaces
    s = norm_space(s)

    # If it is ALLCAPS but short, keep
    if s.isupper():
        return s

    # Title-case-ish normalization but preserve internal acronyms
    # (We won’t force title case aggressively; Harrison has mixed styles)
    return s


def extract_title_from_meta(meta: Dict[str, Any]) -> Optional[str]:
    """
    We ONLY trust metadata keys that can represent a topic title.
    We explicitly ignore section headings like Epidemiology/Diagnosis/etc.
    """
    for k in ("topic_title", "toc_title", "title", "heading", "h1"):
        v = meta.get(k)
        if isinstance(v, str) and v.strip():
            t = normalize_title(v)
            if t:
                return t
    return None


_HEADING_LINE_RE = re.compile(r"^[A-Z][A-Za-z0-9 \-\(\)/]+$")


def extract_title_from_text(doc: str) -> Optional[str]:
    doc = (doc or "").strip()
    if not doc:
        return None

    # Consider first 6 lines only
    lines = [ln.strip() for ln in doc.splitlines()[:6] if ln.strip()]
    if not lines:
        return None

    # Prefer a clean heading-like first line
    for ln in lines[:3]:
        ln2 = strip_index_noise(ln)
        if not ln2:
            continue
        if not _HEADING_LINE_RE.match(ln2):
            continue
        t = normalize_title(ln2)
        if t:
            return t

    return None


def main():
    client = chromadb.PersistentClient(path=CHROMA_DIR)
    col = client.get_collection(COLLECTION)

    data = col.get(include=["documents", "metadatas"])
    ids: List[str] = data.get("ids") or []
    metas: List[Dict[str, Any]] = data.get("metadatas") or []
    docs: List[str] = data.get("documents") or []

    topic_to_ids: Dict[str, List[str]] = defaultdict(list)

    for cid, meta, doc in zip(ids, metas, docs):
        meta = meta or {}
        doc = doc or ""

        title = extract_title_from_meta(meta)
        if not title:
            title = extract_title_from_text(doc)

        if not title:
            continue

        topic_to_ids[title].append(cid)

    # Merge by lowercase exact match
    merged: Dict[str, Dict[str, Any]] = {}
    for t, chunk_ids in topic_to_ids.items():
        key = t.lower()
        if key not in merged:
            merged[key] = {
                "display_title": t,
                "aliases": [],
                "collection": COLLECTION,
                "chunk_ids": [],
            }
        merged[key]["chunk_ids"].extend(chunk_ids)

    topics = list(merged.values())

    # Sort alphabetically for suggestion UX
    topics.sort(key=lambda x: x["display_title"].lower())

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps({"topics": topics}, indent=2), encoding="utf-8")

    print(f"✅ Wrote topic index: {OUT_PATH} (topics={len(topics)})")
    print("Sample (first 30):")
    for t in topics[:30]:
        print(" -", t["display_title"])


if __name__ == "__main__":
    main()
