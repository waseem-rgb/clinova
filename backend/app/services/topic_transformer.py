# Doctor-grade fixes: narrative filter + urine qual severity + B12 normalization + HDL low + DM severity
from __future__ import annotations

import hashlib
import json
import re
import time
from typing import Any, Dict, List, Tuple

from app.rag.llm_client import llm_generate


MAX_CHUNKS = 16
MAX_CHARS_PER_CHUNK = 900
TRANSFORM_VERSION = "v7"
UI_SCHEMA_VERSION = "v1"

REQUIRED_SECTION_IDS = [
    "definition",
    "etiology",
    "clinical_features",
    "diagnostic_approach",
    "treatment_strategy",
    "follow_up",
]

SECTION_TITLES = {
    "definition": "Definition",
    "etiology": "Etiology and risk factors",
    "pathophysiology": "Pathophysiology (clinically relevant)",
    "classification": "Classification and types",
    "clinical_features": "Clinical features",
    "differential_diagnosis": "Differential diagnosis",
    "diagnostic_approach": "Diagnostic approach",
    "treatment_strategy": "Treatment strategy",
    "follow_up": "Follow-up and monitoring",
    "clinical_pearls": "Clinical pearls & pitfalls",
    "associated_syndromes": "Associated syndromes / special contexts",
    "additional_notes": "Additional notes",
    "key_takeaway": "Key takeaway",
}

SECTION_KEYWORDS = {
    "definition": ["definition", "defined as", "is defined as"],
    "etiology": ["etiology", "cause", "risk factor", "risk factors"],
    "pathophysiology": ["pathophysiology", "pathogenesis", "mechanism"],
    "classification": ["classification", "type", "subtype"],
    "clinical_features": ["clinical features", "presentation", "signs", "symptoms", "amenorrhea", "galactorrhea"],
    "differential_diagnosis": ["differential", "consider", "vs", "versus"],
    "diagnostic_approach": ["diagnosis", "diagnostic", "evaluation", "workup", "approach", "mri", "measure", "exclude"],
    "treatment_strategy": ["treatment", "therapy", "management", "cabergoline", "bromocriptine", "dopamine agonist", "surgery"],
    "follow_up": ["follow-up", "follow up", "monitor", "repeat", "visual field"],
    "clinical_pearls": ["pitfall", "pearl", "caution", "false", "artifact", "error", "hook effect", "macro-", "macroprolactin"],
}

SYNDROME_TERMS = [
    "men-1",
    "men 1",
    "men1",
    "multiple endocrine neoplasia",
    "neurofibromatosis",
    "carney complex",
]

TOPIC_SYNONYMS = {
    "hyperprolactinemia": [
        "prolactin",
        "prolactinoma",
        "prl",
        "pituitary adenoma",
        "galactorrhea",
        "amenorrhea",
    ],
    "metformin": [
        "biguanide",
        "dimethylbiguanide",
        "glucophage",
        "glycomet",
    ],
    "epilepsy": [
        "seizure",
        "seizures",
        "seizure disorder",
        "antiepileptic",
        "aed",
        "convulsion",
        "status epilepticus",
    ],
}


def _normalize_text(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def _hash_str(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _dedupe_chunks(chunks: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], float]:
    start = time.monotonic()
    seen = set()
    out: List[Dict[str, Any]] = []
    for ch in chunks:
        text = _normalize_text(ch.get("text") or "")
        if not text:
            continue
        key = _hash_str(text[:400])
        if key in seen:
            continue
        seen.add(key)
        out.append(ch)
    return out, (time.monotonic() - start) * 1000


def _truncate_chunks(chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    trimmed = []
    for ch in chunks[:MAX_CHUNKS]:
        text = _normalize_text(ch.get("text") or "")
        if len(text) > MAX_CHARS_PER_CHUNK:
            text = text[:MAX_CHARS_PER_CHUNK].rstrip() + "…"
        trimmed.append({**ch, "text": text})
    return trimmed


def _split_paragraphs(text: str) -> List[str]:
    cleaned = (text or "").replace("•", "\n").replace("\u2022", "\n")
    raw_blocks = re.split(r"\n{2,}", cleaned)
    paragraphs: List[str] = []
    for block in raw_blocks:
        for line in block.split("\n"):
            line = _normalize_text(line)
            if len(line) < 20:
                continue
            paragraphs.append(line)
    return paragraphs


def _score_section(text: str, keywords: List[str]) -> int:
    t = text.lower()
    return sum(1 for kw in keywords if kw in t)


def _tokenize_topic(topic: str) -> List[str]:
    parts = re.split(r"[\s\-/]+", (topic or "").lower())
    return [p for p in parts if p]


def _topic_anchors(topic: str) -> Dict[str, List[str]]:
    base = _tokenize_topic(topic)
    aliases = TOPIC_SYNONYMS.get(topic.lower(), [])
    strong = [topic.lower()]
    match = re.search(r"\(([A-Z]{2,6})\)", topic)
    if match:
        strong.append(match.group(1).lower())
    if topic.isupper() and len(topic) <= 8:
        strong.append(topic.lower())
    return {"terms": base + [a.lower() for a in aliases], "strong": strong + [a.lower() for a in aliases]}


def _sentence_has_anchor(sentence: str, anchors: Dict[str, List[str]]) -> bool:
    s = sentence.lower()
    if any(a in s for a in anchors.get("strong", [])):
        return True
    return any(a in s for a in anchors.get("terms", []))


def _has_syndrome(sentence: str) -> bool:
    s = sentence.lower()
    return any(term in s for term in SYNDROME_TERMS)


def _chunk_allowed_for_quick_view(ch: Dict[str, Any]) -> bool:
    source_ok = bool(ch.get("source_ok", True))
    if source_ok:
        return True
    return bool(ch.get("strong_hit")) and (ch.get("overlap_score") or 0) >= 2


def _extract_bullets_from_chunks(chunks: List[Dict[str, Any]], limit: int = 10) -> List[str]:
    bullets: List[str] = []
    for ch in chunks:
        if not _chunk_allowed_for_quick_view(ch):
            continue
        text = ch.get("text") or ""
        for sent in re.split(r"(?<=[.!?])\s+", text):
            s = _normalize_text(sent)
            if "[unclear fragment]" in s:
                continue
            if len(s) >= 20 and s not in bullets:
                bullets.append(s)
            if len(bullets) >= limit:
                return bullets
    return bullets


def _section_has_content(section: Dict[str, Any]) -> bool:
    content = [c for c in (section.get("content") or []) if _normalize_text(c)]
    if content:
        return True
    for sub in section.get("subsections") or []:
        sub_content = [c for c in (sub.get("content") or []) if _normalize_text(c)]
        if sub_content:
            return True
    for tbl in section.get("tables") or []:
        rows = tbl.get("rows") or []
        if rows:
            return True
    return False


def _bucketize_chunks(topic: str, chunks: List[Dict[str, Any]]) -> Tuple[Dict[str, List[str]], Dict[str, List[str]]]:
    anchors = _topic_anchors(topic)
    buckets: Dict[str, List[str]] = {sid: [] for sid in SECTION_TITLES}
    section_chunk_ids: Dict[str, List[str]] = {sid: [] for sid in SECTION_TITLES}

    for ch in chunks:
        paragraphs = _split_paragraphs(ch.get("text") or "")
        for para in paragraphs:
            if "[unclear fragment]" in para:
                continue
            if not _sentence_has_anchor(para, anchors):
                continue
            if _has_syndrome(para):
                buckets["associated_syndromes"].append(para)
                section_chunk_ids["associated_syndromes"].append(ch.get("chunk_id") or "")
                continue

            scores = {sid: _score_section(para, kws) for sid, kws in SECTION_KEYWORDS.items()}
            best_sid = None
            best_score = 0
            for sid, score in scores.items():
                if score > best_score:
                    best_score = score
                    best_sid = sid
            if best_sid and best_score > 0:
                buckets[best_sid].append(para)
                section_chunk_ids[best_sid].append(ch.get("chunk_id") or "")
            else:
                buckets["additional_notes"].append(para)
                section_chunk_ids["additional_notes"].append(ch.get("chunk_id") or "")
    return buckets, section_chunk_ids


def _fill_sections_from_buckets(sections: List[Dict[str, Any]], buckets: Dict[str, List[str]]) -> List[Dict[str, Any]]:
    by_id = {s.get("id"): s for s in sections if s.get("id")}
    for sid, title in SECTION_TITLES.items():
        bucket_items = buckets.get(sid) or []
        if not bucket_items:
            continue
        existing = by_id.get(sid)
        if existing and _section_has_content(existing):
            continue
        by_id[sid] = {
            "id": sid,
            "title": title,
            "content": bucket_items[:10],
            "subsections": [],
            "tables": [],
        }
    return list(by_id.values())


def _clean_sections(sections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    cleaned = []
    for section in sections:
        if not isinstance(section, dict):
            continue
        section.setdefault("content", [])
        section.setdefault("subsections", [])
        section.setdefault("tables", [])
        section["content"] = [c for c in section.get("content") or [] if _normalize_text(c)]
        cleaned.append(section)
    return cleaned


def _extract_thresholds(topic: str, chunks: List[Dict[str, Any]]) -> Tuple[List[Dict[str, str]], int, int, List[Dict[str, str]]]:
    anchors = _topic_anchors(topic)
    thresholds: List[Dict[str, str]] = []
    dropped = 0
    kept = 0
    dropped_reasons: List[Dict[str, str]] = []
    comparator_re = re.compile(r"(<=|>=|<|>|≤|≥)\s*\d")
    number_unit_re = re.compile(r"\d+(?:\.\d+)?\s*(mg|mmol|ng|pg|ml|dL|IU|mIU|uIU|%|g/L|mg/dL|mmHg)\b", re.I)

    for ch in chunks:
        text = ch.get("text") or ""
        if not _chunk_allowed_for_quick_view(ch):
            continue
        sentences = re.split(r"(?<=[.!?])\s+", text)
        for sent in sentences:
            s = _normalize_text(sent)
            if len(s) < 20 or "[unclear fragment]" in s:
                continue
            if not (comparator_re.search(s) or number_unit_re.search(s)):
                continue
            if not _sentence_has_anchor(s, anchors):
                dropped += 1
                dropped_reasons.append({"sentence": s[:160], "reason": "no_anchor"})
                continue

            meaning = ""
            next_step = ""
            if "then" in s:
                parts = s.split("then", 1)
                meaning = parts[0].strip()
                next_step = parts[1].strip()
            elif "should" in s:
                parts = s.split("should", 1)
                meaning = parts[0].strip()
                next_step = "should " + parts[1].strip()
            elif "recommend" in s:
                parts = s.split("recommend", 1)
                meaning = parts[0].strip()
                next_step = "recommend " + parts[1].strip()

            if not meaning or not next_step:
                dropped += 1
                dropped_reasons.append({"sentence": s[:160], "reason": "incomplete_fields"})
                continue

            thresholds.append({"finding": s, "meaning": meaning, "next_step": next_step})
            kept += 1

    return thresholds, kept, dropped, dropped_reasons


def _build_prompt(topic: str, chunks: List[Dict[str, Any]], buckets: Dict[str, List[str]], strict: bool = False) -> str:
    evidence_blocks = []
    for idx, ch in enumerate(chunks, start=1):
        evidence_blocks.append(
            f"E{idx} [source={ch.get('book')}, chapter={ch.get('chapter')}, page={ch.get('page_start')}]:\n{ch.get('text')}"
        )

    evidence_text = "\n\n".join(evidence_blocks)

    bucket_lines: List[str] = []
    for sid, lines in buckets.items():
        if not lines:
            continue
        title = SECTION_TITLES.get(sid, sid)
        snippets = "\n".join(f"- {ln}" for ln in lines[:12])
        bucket_lines.append(f"[{sid}] {title}\n{snippets}")

    bucket_text = "\n\n".join(bucket_lines)

    strict_clause = "You must include ALL bucket content. Do not omit any bucket lines." if strict else ""

    return f"""
You are formatting evidence into a doctor-first structured topic view.
Do NOT add new medical facts; only reformat supplied evidence.
Do NOT mix content between sections.
If a section has no support in the evidence, omit that section entirely.
{strict_clause}
Output MUST be valid JSON matching this schema exactly:
{{
  "quick_view": {{"bullets": [string], "table": [{{"q":"...","a":"..."}}]}},
  "thresholds": [{{"finding":"...","meaning":"...","next_step":"..."}}],
  "sections": [
    {{
      "id":"definition",
      "title":"Definition",
      "content":[string],
      "subsections":[{{"title":"Women","content":[string]}}],
      "tables":[{{"title":"","columns":["",""],"rows":[["",""]]}}]
    }}
  ],
  "pearls":[string],
  "takeaway":[string]
}}

Topic: {topic}

Bucketed evidence (use only these lines, no new facts):
{bucket_text}

Evidence:
{evidence_text}
"""


def _parse_json(raw: str) -> Dict[str, Any] | None:
    try:
        return json.loads(raw)
    except Exception:
        pass
    if not raw:
        return None
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        return json.loads(raw[start : end + 1])
    except Exception:
        return None


def _deterministic_doctor_view(
    chunks: List[Dict[str, Any]],
    buckets: Dict[str, List[str]],
    thresholds: List[Dict[str, str]],
) -> Dict[str, Any]:
    bullets = _extract_bullets_from_chunks(chunks, limit=10)
    sections: List[Dict[str, Any]] = []
    for sid, title in SECTION_TITLES.items():
        items = buckets.get(sid) or []
        if not items:
            continue
        sections.append(
            {
                "id": sid,
                "title": title,
                "content": items[:10],
                "subsections": [],
                "tables": [],
            }
        )
    return {
        "quick_view": {"bullets": bullets[:10], "table": []},
        "thresholds": thresholds,
        "sections": sections,
        "pearls": [],
        "takeaway": [],
    }


def _ensure_quick_view(doctor_view: Dict[str, Any], chunks: List[Dict[str, Any]]) -> None:
    quick_view = doctor_view.get("quick_view") or {"bullets": [], "table": []}
    bullets = [b for b in (quick_view.get("bullets") or []) if _normalize_text(b)]
    if len(bullets) < 6:
        extra = _extract_bullets_from_chunks(chunks, limit=10)
        for b in extra:
            if b not in bullets:
                bullets.append(b)
            if len(bullets) >= 10:
                break
    quick_view["bullets"] = bullets
    doctor_view["quick_view"] = quick_view


def missing_required_sections(doctor_view: Dict[str, Any]) -> List[str]:
    sections = doctor_view.get("sections") or []
    by_id = {s.get("id"): s for s in sections if isinstance(s, dict)}
    missing = []
    for sid in REQUIRED_SECTION_IDS:
        section = by_id.get(sid)
        if not section or not _section_has_content(section):
            missing.append(sid)
    return missing


async def repair_evidence_chunks(
    chunks: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    to_repair = []
    for ch in chunks:
        text = ch.get("text") or ""
        if "\n" in text or "­" in text or re.search(r"\w-\s+\w", text):
            to_repair.append(ch)
    if not to_repair:
        return chunks, []

    subset = to_repair[:12]
    payload = []
    for ch in subset:
        payload.append({"id": ch.get("chunk_id"), "text": ch.get("text")})

    prompt = f"""
You repair fragmented medical evidence sentences WITHOUT adding new facts.
Rules:
- Use ONLY words already in the chunk text, plus minimal glue words (and/or/the/a/of).
- Do NOT introduce new diagnoses, drugs, tests, thresholds, or syndromes.
- If a sentence cannot be repaired, keep it and append "[unclear fragment]".
Return valid JSON only, schema:
{{"chunks":[{{"id":"...","repaired_text":"...","changes":["..."]}}]}}

Input:
{json.dumps(payload)}
"""

    raw = await llm_generate(prompt)
    parsed = _parse_json(raw)
    if not parsed or "chunks" not in parsed:
        return chunks, []

    repaired_map = {item.get("id"): item for item in parsed.get("chunks", []) if item.get("id")}
    repaired = []
    changes_debug = []
    for ch in chunks:
        cid = ch.get("chunk_id")
        if cid in repaired_map:
            item = repaired_map[cid]
            repaired_text = _normalize_text(item.get("repaired_text") or ch.get("text") or "")
            repaired.append({**ch, "text": repaired_text})
            changes_debug.append({"id": cid, "changes": item.get("changes") or []})
        else:
            repaired.append(ch)
    return repaired, changes_debug


async def transform_topic(topic: str, chunks: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], float, Dict[str, Any]]:
    start = time.monotonic()
    repaired_chunks, repair_changes = await repair_evidence_chunks(chunks)
    buckets, section_chunk_ids = _bucketize_chunks(topic, repaired_chunks)
    thresholds, thresholds_kept, thresholds_dropped, thresholds_dropped_reasons = _extract_thresholds(topic, repaired_chunks)

    prompt = _build_prompt(topic, repaired_chunks, buckets, strict=False)
    raw = await llm_generate(prompt)
    data = _parse_json(raw)

    if data is None:
        retry_prompt = _build_prompt(topic, repaired_chunks, buckets, strict=True) + "\nReturn valid JSON only."
        data = _parse_json(await llm_generate(retry_prompt))

    if not isinstance(data, dict):
        data = _deterministic_doctor_view(repaired_chunks, buckets, thresholds)
        return data, (time.monotonic() - start) * 1000, {
            "buckets": buckets,
            "section_chunk_ids": section_chunk_ids,
            "thresholds_kept": thresholds_kept,
            "thresholds_dropped": thresholds_dropped,
            "thresholds_dropped_reasons": thresholds_dropped_reasons,
            "repair_changes": repair_changes,
            "repaired_chunks": repaired_chunks,
        }

    data.setdefault("quick_view", {"bullets": [], "table": []})
    data["thresholds"] = thresholds
    data.setdefault("sections", [])
    data.setdefault("pearls", [])
    data.setdefault("takeaway", [])

    data["sections"] = _clean_sections(data.get("sections") or [])
    data["sections"] = _fill_sections_from_buckets(data.get("sections") or [], buckets)

    _ensure_quick_view(data, repaired_chunks)

    return data, (time.monotonic() - start) * 1000, {
        "buckets": buckets,
        "section_chunk_ids": section_chunk_ids,
        "thresholds_kept": thresholds_kept,
        "thresholds_dropped": thresholds_dropped,
        "thresholds_dropped_reasons": thresholds_dropped_reasons,
        "repair_changes": repair_changes,
        "repaired_chunks": repaired_chunks,
    }


def build_evidence_items(chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    items = []
    for idx, ch in enumerate(chunks, start=1):
        items.append(
            {
                "id": f"e{idx}",
                "text": ch.get("text"),
                "meta": {
                    "source": ch.get("book"),
                    "chapter": ch.get("chapter"),
                    "page_start": ch.get("page_start"),
                    "page_end": ch.get("page_end"),
                },
            }
        )
    return items


def evidence_hash(chunks: List[Dict[str, Any]]) -> str:
    parts = []
    for ch in chunks:
        parts.append(str(ch.get("chunk_id") or ""))
        parts.append(_normalize_text(ch.get("text") or "")[:400])
    return _hash_str("||".join(parts))
