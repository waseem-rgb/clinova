from __future__ import annotations

import re
from typing import Any, Dict, List, Set

from app.rag.retrieve.query import retrieve_chunks
from app.rag.present.coverage import coverage_gate, clean_read_blocks

SECTION_KEYS = {
    "indications": ["indications", "uses"],
    "dosage": ["dosage", "dose", "administration"],
    "contraindications": ["contraindications"],
    "warnings_precautions": ["warnings", "precautions"],
    "pregnancy_lactation": ["pregnancy", "lactation"],
    "adverse_effects": ["adverse", "side effects"],
    "interactions": ["interactions"],
    "monitoring": ["monitor", "monitoring"],
}


def _split_sections(text: str) -> Dict[str, List[str]]:
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    sections: Dict[str, List[str]] = {k: [] for k in SECTION_KEYS}
    current: str | None = None

    for ln in lines:
        ln_clean = ln.strip(" :")
        lower = ln_clean.lower()
        matched = None
        for key, markers in SECTION_KEYS.items():
            if any(m in lower for m in markers) and lower == ln_clean.lower():
                matched = key
                break
        if matched:
            current = matched
            continue
        if current:
            sections[current].append(ln)

    return sections


def search_drugs(q: str) -> List[str]:
    if not q:
        return []
    retrieved = retrieve_chunks(query=q, collection_key="drugs_mims", top_k=6)
    names: List[str] = []
    seen = set()
    for ch in retrieved:
        text = (ch.get("text") or "").strip()
        first = text.splitlines()[0] if text else ""
        candidate = first.strip()
        if not candidate:
            continue
        if len(candidate) > 60:
            candidate = candidate[:60]
        key = candidate.lower()
        if key in seen:
            continue
        seen.add(key)
        names.append(candidate)
    return names[:12]


def drug_monograph(name: str, debug: bool = False) -> Dict[str, Any]:
    retrieved = retrieve_chunks(query=name, collection_key="drugs_mims", top_k=12)
    evidence = [
        {
            "chunk_id": ch.get("chunk_id"),
            "book": ch.get("book"),
            "chapter": ch.get("chapter"),
            "page_start": ch.get("page_start"),
            "page_end": ch.get("page_end"),
            "snippet": (ch.get("text") or "")[:420],
        }
        for ch in retrieved
    ]

    sections: Dict[str, List[Dict[str, Any]]] = {k: [] for k in SECTION_KEYS}
    used_chunk_ids: Set[str] = set()

    for ch in retrieved:
        text = ch.get("text") or ""
        parts = _split_sections(text)
        for key, items in parts.items():
            if not items:
                continue
            sections[key].append({"text": " ".join(items)[:600], "citations": [ch.get("chunk_id")]})
        if ch.get("chunk_id"):
            used_chunk_ids.add(ch.get("chunk_id"))

    coverage = coverage_gate(retrieved, used_chunk_ids)

    response: Dict[str, Any] = {
        "drug_name": name,
        "indications": sections["indications"],
        "dosage": sections["dosage"],
        "contraindications": sections["contraindications"],
        "warnings_precautions": sections["warnings_precautions"],
        "pregnancy_lactation": sections["pregnancy_lactation"],
        "adverse_effects": sections["adverse_effects"],
        "interactions_summary": sections["interactions"],
        "monitoring": sections["monitoring"],
        "evidence": evidence,
        "coverage_gate": coverage,
    }

    if not coverage.get("passed"):
        response["clean_read_blocks"] = clean_read_blocks(retrieved)

    if debug:
        response["debug"] = {"retrieved": evidence}

    return response
