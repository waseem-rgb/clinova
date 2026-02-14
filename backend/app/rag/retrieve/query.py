from __future__ import annotations

from typing import Any, Dict, List

from app.rag.query_engine import retrieve


COLLECTIONS_MAP = {
    "core_textbooks": [
        "medicine_harrison",
        "obgyn_dutta",
        "surgery_oxford",
        "pediatrics_oxford",
        "kd_tripathi",
        "tripathi",
    ],
    "drugs_mims": ["drugs_mims_kd"],
}


def _normalize_meta(meta: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "book": meta.get("book_title") or meta.get("book") or "Unknown",
        "chapter": meta.get("chapter") or meta.get("section") or meta.get("heading"),
        "page": meta.get("page_number") if isinstance(meta.get("page_number"), int) else meta.get("page"),
        "book_id": meta.get("book_id"),
        "section_path": meta.get("section_path") or meta.get("section") or meta.get("chapter"),
    }


def retrieve_chunks(
    *,
    query: str,
    collection_key: str,
    top_k: int = 8,
) -> List[Dict[str, Any]]:
    collections = COLLECTIONS_MAP.get(collection_key, [collection_key])
    gathered: List[Dict[str, Any]] = []
    seen = set()

    for col in collections:
        try:
            docs = retrieve(col, query, top_k)
        except Exception:
            continue
        for d in docs:
            cid = d.get("id")
            if cid and cid in seen:
                continue
            seen.add(cid)
            meta = d.get("metadata") or {}
            normalized = _normalize_meta(meta)
            gathered.append(
                {
                    "chunk_id": cid,
                    "text": d.get("text") or "",
                    "score": d.get("score"),
                    "collection": col,
                    "book": normalized.get("book"),
                    "chapter": normalized.get("chapter"),
                    "page_start": normalized.get("page"),
                    "page_end": normalized.get("page"),
                    "book_id": normalized.get("book_id"),
                    "section_path": normalized.get("section_path"),
                }
            )

    return gathered
