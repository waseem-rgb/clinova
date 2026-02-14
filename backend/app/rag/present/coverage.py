from __future__ import annotations

from typing import Dict, List, Set


def coverage_gate(retrieved: List[Dict[str, str]], used_chunk_ids: Set[str]) -> Dict[str, List[str] | bool]:
    missing = []
    for ch in retrieved:
        cid = ch.get("chunk_id")
        if cid and cid not in used_chunk_ids:
            missing.append(cid)
    return {"passed": len(missing) == 0, "missing_chunk_ids": missing}


def clean_read_blocks(retrieved: List[Dict[str, str]]) -> List[Dict[str, str]]:
    blocks = []
    for ch in retrieved:
        blocks.append(
            {
                "chunk_id": ch.get("chunk_id"),
                "book": ch.get("book"),
                "chapter": ch.get("chapter"),
                "page_start": ch.get("page_start"),
                "page_end": ch.get("page_end"),
                "text": (ch.get("text") or "").strip(),
            }
        )
    return blocks
