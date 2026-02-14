from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "drugs_alias_index.json"
MIMS_CHUNKS = Path(__file__).resolve().parents[1] / "data" / "raw_chunks" / "mims_2023_24_chunks.json"


def _load_json(path: Path) -> Any:
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def _normalize_key(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _extract_brand_lines(text: str) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    form_re = re.compile(r"\b(tab(?:let)?|cap(?:sule)?|syrup|inj(?:ection)?|drops|cream|ointment|gel|solution|susp(?:ension)?|powder)\b", re.IGNORECASE)
    strength_re = re.compile(r"\b\d+(?:\.\d+)?\s*(mg|g|mcg|µg|iu|units)\b", re.IGNORECASE)

    for ln in lines:
        if not form_re.search(ln) or not strength_re.search(ln):
            continue
        # Try: BrandName 500 mg tablet
        m = re.search(r"^([A-Z][A-Za-z0-9\\-\\s]{2,40})\\s+(\\d+(?:\\.\\d+)?\\s*(mg|g|mcg|µg|iu|units))\\s+([^,;]+)$", ln)
        if m:
            rows.append(
                {
                    "brand": m.group(1).strip(),
                    "strength": m.group(2).strip(),
                    "form": m.group(4).strip(),
                }
            )
    return rows


def _extract_generic_candidates(text: str) -> List[str]:
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    candidates: List[str] = []
    for ln in lines[:2]:
        if any(ch.isdigit() for ch in ln):
            continue
        if len(ln.split()) > 6:
            continue
        if len(ln) < 3:
            continue
        candidates.append(ln)
    return candidates


def _build_alias_index() -> Dict[str, Any]:
    data = _load_json(MIMS_CHUNKS)
    if not isinstance(data, list):
        return {"canonical_generics": [], "aliases": {}, "brands": []}

    canonical: List[str] = []
    aliases: Dict[str, str] = {}
    brands: List[Dict[str, str]] = []

    for item in data:
        text = item.get("text") if isinstance(item, dict) else ""
        if not isinstance(text, str):
            continue
        for g in _extract_generic_candidates(text):
            g_clean = g.strip()
            if g_clean and g_clean not in canonical:
                canonical.append(g_clean)
        for b in _extract_brand_lines(text):
            brand = b.get("brand")
            if not brand:
                continue
            brand_key = _normalize_key(brand)
            # Map alias to a best-effort generic if any
            generic = canonical[-1] if canonical else brand
            if brand_key not in aliases:
                aliases[brand_key] = generic
            b["generic"] = generic
            brands.append(b)

    return {"canonical_generics": canonical, "aliases": aliases, "brands": brands}


def load_alias_index() -> Dict[str, Any]:
    existing = _load_json(DATA_PATH)
    if isinstance(existing, dict) and existing.get("canonical_generics"):
        return existing
    built = _build_alias_index()
    _save_json(DATA_PATH, built)
    return built


def resolve_name(name: str) -> Dict[str, Any]:
    idx = load_alias_index()
    raw = (name or "").strip()
    if not raw:
        return {"canonical": "", "matched": "", "confidence": 0.0}
    key = _normalize_key(raw)

    if key in idx.get("aliases", {}):
        return {"canonical": idx["aliases"][key], "matched": raw, "confidence": 0.95}

    for g in idx.get("canonical_generics", []):
        if _normalize_key(g) == key:
            return {"canonical": g, "matched": g, "confidence": 0.9}

    # Fuzzy contains fallback
    for g in idx.get("canonical_generics", []):
        if key in _normalize_key(g):
            return {"canonical": g, "matched": g, "confidence": 0.6}

    return {"canonical": raw, "matched": raw, "confidence": 0.3}


def search_suggestions(q: str, limit: int = 12) -> List[Dict[str, Any]]:
    idx = load_alias_index()
    query = _normalize_key(q)
    if not query:
        return []

    suggestions: List[Dict[str, Any]] = []
    seen = set()

    for b in idx.get("brands", []):
        brand = b.get("brand") or ""
        if query in _normalize_key(brand):
            generic = b.get("generic") or ""
            display = f"{brand} ({generic})"
            strength = b.get("strength")
            form = b.get("form")
            if strength or form:
                display = f"{display} — {strength or ''} {form or ''}".strip()
            item = {
                "display": display.strip(),
                "input": brand,
                "canonical": generic or brand,
                "type": "brand",
            }
            key = _normalize_key(display)
            if key not in seen:
                seen.add(key)
                suggestions.append(item)
        if len(suggestions) >= limit:
            break

    for g in idx.get("canonical_generics", []):
        if len(suggestions) >= limit:
            break
        if query in _normalize_key(g):
            display = f"{g} (Generic)"
            key = _normalize_key(display)
            if key not in seen:
                seen.add(key)
                suggestions.append({"display": display, "input": g, "canonical": g, "type": "generic"})

    return suggestions[:limit]
