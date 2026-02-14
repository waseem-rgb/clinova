# Doctor-grade fixes: narrative filter + urine qual severity + B12 normalization + HDL low + DM severity
from __future__ import annotations

import hashlib
import json
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

from app.rag.retrieve.query import retrieve_chunks
from app.services.topic_cache import LRUCacheTTL
from app.services.topic_transformer import (
    TRANSFORM_VERSION,
    UI_SCHEMA_VERSION,
    build_evidence_items,
    evidence_hash,
    transform_topic,
    _dedupe_chunks,
    _truncate_chunks,
)

TOPIC_INDEX_PATH = Path(__file__).resolve().parents[1] / "data" / "topic_index_harrison.json"

EVIDENCE_CACHE = LRUCacheTTL(max_size=256, ttl_seconds=3600)
TRANSFORM_CACHE = LRUCacheTTL(max_size=256, ttl_seconds=3600)
RESPONSE_CACHE = LRUCacheTTL(max_size=256, ttl_seconds=3600)

BASE_QUERIES = [
    "{topic}",
    "{topic} diagnosis evaluation workup",
    "{topic} treatment management",
    "{topic} differential diagnosis",
    "{topic} complications follow-up monitoring",
    "{topic} pitfalls pearls",
]

TARGETED_QUERY_MAP = {
    "diagnosis": "{topic} diagnosis evaluation workup approach",
    "treatment": "{topic} treatment management therapy",
    "features": "{topic} clinical features presentation",
    "differential": "{topic} differential diagnosis",
    "followup": "{topic} follow-up monitoring",
    "pearls": "{topic} pitfalls pearls",
}

COVERAGE_CUES = {
    "definition": ["definition", "classified", "type", "group", "pathogenesis"],
    "etiology": ["cause", "etiology", "risk factor", "secondary", "primary"],
    "features": ["clinical", "symptom", "sign", "presentation", "manifest"],
    "diagnosis": ["diagnosis", "evaluation", "workup", "approach", "investigation", "mri", "ct", "test", "measure", "screen"],
    "differential": ["differential", "consider", "vs", "rule out"],
    "treatment": ["treat", "therapy", "management", "first-line", "drug", "surgery", "intervention"],
    "followup": ["monitor", "follow", "repeat", "surveillance", "response"],
    "pearls": ["pitfall", "pearl", "caution", "false", "artifact", "error", "hook effect", "macro-"],
}

FORBIDDEN_KEYWORDS = [
    "pseudomyxoma",
    "psoas abscess",
    "p-value",
    "cavernosometry",
    "cavernositis",
    "peyronie",
    "priapism",
    "penile",
    "retained placental",
    "placental",
    "maintenance of lactation",
    "psa",
    "prostate",
    "bone metastasis",
    "karyotyping of the conceptus",
    "abo",
    "rh",
    "vdrl",
    "toxoplasma",
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


def _load_topics() -> List[Dict[str, Any]]:
    if TOPIC_INDEX_PATH.exists():
        data = json.loads(TOPIC_INDEX_PATH.read_text(encoding="utf-8"))
        return data.get("topics") or []
    return []


def suggest_topics(q: str, limit: int = 15) -> List[str]:
    q = (q or "").strip().lower()
    if not q:
        return []
    topics = _load_topics()
    matches = []
    for t in topics:
        title = t.get("display_title") or ""
        if q in title.lower():
            matches.append(title)
        if len(matches) >= limit:
            break
    return matches


def _cache_key(prefix: str, payload: str) -> str:
    return f"{prefix}:{hashlib.sha256(payload.encode('utf-8')).hexdigest()}"


def _build_queries(topic: str) -> List[str]:
    return [q.format(topic=topic) for q in BASE_QUERIES]


def _normalize_text(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def _first_line(text: str) -> str:
    if not text:
        return ""
    return text.splitlines()[0].strip()[:200]


def _tokenize_topic(topic: str) -> List[str]:
    parts = re.split(r"[\s\-/]+", (topic or "").lower())
    return [p for p in parts if p]


def _build_topic_profile(topic: str) -> Dict[str, List[str]]:
    terms = _tokenize_topic(topic)
    aliases = TOPIC_SYNONYMS.get(topic.lower(), [])
    weak = terms + [a.lower() for a in aliases]
    strong = [topic.lower()]
    match = re.search(r"\(([A-Z]{2,6})\)", topic)
    if match:
        strong.append(match.group(1).lower())
    if topic.isupper() and len(topic) <= 8:
        strong.append(topic.lower())
    strong += [a.lower() for a in aliases]
    return {"topic_terms": terms, "weak_anchors": weak, "strong_anchors": strong, "aliases": aliases}


def _keyword_overlap(text: str, keywords: List[str]) -> Tuple[int, List[str]]:
    t = text.lower()
    found = [kw for kw in keywords if kw in t]
    return len(found), found


def _has_forbidden(text: str, forbidden: List[str]) -> List[str]:
    t = text.lower()
    return [kw for kw in forbidden if kw in t]


def _extract_numbers(sample: str) -> int:
    return len(re.findall(r"\b\d+(?:\.\d+)?\b", sample))


def _clean_chunk_text(text: str) -> str:
    if not text:
        return ""
    normalized = text.replace("\r", "\n").replace("\u00ad", "")
    normalized = re.sub(r"(\w)-\s*\n(\w)", r"\1\2", normalized)
    lines = [line.strip() for line in normalized.split("\n")]
    cleaned_lines: List[str] = []
    for line in lines:
        if not line:
            continue
        if any(marker in line for marker in ["►", "❖", "Prophylaxis and Management ►", "Management ►", "Treatment ►"]):
            continue
        if len(line) < 3 and not re.search(r"[A-Za-z0-9]", line):
            continue
        if line.count(",") > 10:
            continue
        if _extract_numbers(line) > 6 and "mg" not in line.lower():
            continue
        if re.search(r"\{\d+\)|\bbits\);", line):
            continue
        cleaned_lines.append(line)

    merged: List[str] = []
    for line in cleaned_lines:
        if not merged:
            merged.append(line)
            continue
        prev = merged[-1]
        if prev and not re.search(r"[.!?]$", prev) and line and line[0].islower():
            merged[-1] = prev + " " + line
        else:
            merged.append(line)

    return "\n".join(merged)


def _strip_forbidden_sentences(text: str, weak_anchors: List[str], strong_anchors: List[str]) -> Tuple[str, List[str]]:
    if not text:
        return "", []
    sentences = re.split(r"(?<=[.!?])\s+", text)
    kept = []
    dropped = []
    for sent in sentences:
        s = _normalize_text(sent)
        if not s:
            continue
        forbidden = _has_forbidden(s, FORBIDDEN_KEYWORDS)
        if forbidden:
            if any(f in weak_anchors for f in forbidden) or any(a in s.lower() for a in strong_anchors):
                kept.append(s)
            else:
                dropped.append(s)
        else:
            kept.append(s)
    return " ".join(kept), dropped


def _is_garbage_chunk(text: str) -> Tuple[bool, str]:
    raw = (text or "").strip()
    if len(raw) < 120:
        return True, "short_fragment"

    if any(marker in raw for marker in ["►", "❖", "Prophylaxis and Management ►", "Management ►", "Treatment ►"]):
        return True, "toc_marker"

    sample = raw[:400]
    if sample.count(",") > 12:
        return True, "comma_dump"

    if _extract_numbers(sample) > 6 and "mg" not in sample.lower():
        return True, "number_dump"

    if "p-value" in sample.lower() and sample.count(",") > 5:
        return True, "p_value_list"

    if sample.count(".") < 2 and sample.count(":") < 1 and len(sample.split()) < 20:
        return True, "low_sentence_density"

    return False, ""


def _multi_query_retrieve(
    *,
    queries: List[str],
    per_query: int,
    collection_key: str,
) -> List[Dict[str, Any]]:
    gathered: List[Dict[str, Any]] = []
    for q in queries:
        items = retrieve_chunks(query=q, collection_key=collection_key, top_k=per_query)
        for item in items:
            raw_text = item.get("text") or ""
            cleaned = _clean_chunk_text(raw_text)
            gathered.append({**item, "raw_text": raw_text, "text": cleaned})
    return gathered


def _rank_chunks(chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(chunks, key=lambda c: (c.get("score") is not None, c.get("score") or 0), reverse=True)


def _dedupe_ranked(chunks: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], float]:
    seen_ids = set()
    ranked = []
    for ch in _rank_chunks(chunks):
        cid = ch.get("chunk_id")
        if cid and cid in seen_ids:
            continue
        if cid:
            seen_ids.add(cid)
        ranked.append(ch)
    return _dedupe_chunks(ranked)


def _cap_chunks(chunks: List[Dict[str, Any]], cap: int) -> List[Dict[str, Any]]:
    return chunks[:cap]


def _coverage_bucket_counts(chunks: List[Dict[str, Any]]) -> Dict[str, int]:
    counts = {k: 0 for k in COVERAGE_CUES.keys()}
    for ch in chunks:
        text = (ch.get("text") or "").lower()
        for key, cues in COVERAGE_CUES.items():
            if any(cue in text for cue in cues):
                counts[key] += 1
    return counts


def _missing_key_buckets(counts: Dict[str, int]) -> List[str]:
    missing = []
    for key in ["diagnosis", "treatment", "features"]:
        if counts.get(key, 0) == 0:
            missing.append(key)
    return missing


def _keywords_in_evidence(chunks: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    text = " ".join(ch.get("text") or "" for ch in chunks).lower()
    found: Dict[str, List[str]] = {}
    for group, keywords in COVERAGE_CUES.items():
        present = [kw for kw in keywords if kw in text]
        found[group] = present
    return found


def _relevance_filter(
    *,
    chunks: List[Dict[str, Any]],
    profile: Dict[str, List[str]],
    debug: bool,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    topic_terms = profile["topic_terms"]
    weak_anchors = profile["weak_anchors"]
    strong_anchors = profile["strong_anchors"]
    topic_word_count = len(topic_terms)
    min_overlap = 1 if topic_word_count <= 1 else 2

    candidates_count = 0
    raw_candidates = []
    kept = []
    dropped = []

    for ch in chunks:
        candidates_count += 1
        raw_text = ch.get("raw_text") or ""
        cleaned_text = _normalize_text(ch.get("text") or "")
        cleaned_text, stripped_sentences = _strip_forbidden_sentences(cleaned_text, weak_anchors, strong_anchors)
        heading = _first_line(cleaned_text)

        overlap, found = _keyword_overlap(cleaned_text, weak_anchors)
        strong_hit = any(anchor in cleaned_text.lower() for anchor in strong_anchors)
        overlap_score = overlap + (1 if any(anchor in heading.lower() for anchor in strong_anchors) else 0)
        forbidden_found = _has_forbidden(cleaned_text, FORBIDDEN_KEYWORDS)
        forbidden_blocked = [f for f in forbidden_found if f not in weak_anchors]
        is_garbage, garbage_reason = _is_garbage_chunk(cleaned_text)

        if debug:
            raw_candidates.append(
                {
                    "id": ch.get("chunk_id"),
                    "score": ch.get("score"),
                    "first_line": heading,
                    "keywords_found": sorted(set(found)),
                    "contains_forbidden": forbidden_blocked,
                    "overlap_score": overlap_score,
                }
            )

        if stripped_sentences:
            dropped.extend({"first_line": s[:160], "reason": "forbidden_sentence"} for s in stripped_sentences)

        if is_garbage:
            dropped.append({"first_line": heading, "reason": garbage_reason})
            continue
        if forbidden_blocked and not strong_hit:
            dropped.append({"first_line": heading, "reason": "forbidden_keyword"})
            continue
        if not strong_hit and overlap_score < min_overlap:
            dropped.append({"first_line": heading, "reason": "low_overlap"})
            continue

        page_start = ch.get("page_start")
        source_ok = bool(ch.get("book")) and ch.get("book") != "Unknown" and isinstance(page_start, int) and page_start > 0

        kept.append({
            **ch,
            "raw_text": raw_text,
            "text": cleaned_text,
            "strong_hit": strong_hit,
            "overlap_score": overlap_score,
            "source_ok": source_ok,
        })

    debug_payload = {
        "candidates_count": candidates_count,
        "raw_candidates": raw_candidates,
        "kept_evidence": [
            {
                "first_line": _first_line(ch.get("text") or ""),
                "source": ch.get("book"),
                "page_start": ch.get("page_start"),
                "page_end": ch.get("page_end"),
                "strong_hit": bool(ch.get("strong_hit")),
                "overlap_score": ch.get("overlap_score") or 0,
            }
            for ch in kept
        ],
        "dropped_evidence": dropped,
    }
    return kept, debug_payload


async def get_topic(topic_id: str, debug: bool = False) -> Dict[str, Any]:
    start_total = time.monotonic()
    topic = (topic_id or "").strip()
    profile = _build_topic_profile(topic)

    cache_hit = {"topic": False, "evidence": False, "transform": False}

    per_query = 4
    cap = 16

    base_queries = _build_queries(topic)
    retrieval_params = json.dumps(
        {"collection": "core_textbooks", "queries": base_queries, "per_query": per_query, "cap": cap},
        sort_keys=True,
    )
    retrieval_hash = hashlib.sha256(retrieval_params.encode("utf-8")).hexdigest()
    evidence_key = _cache_key("evidence", f"{topic}::{retrieval_params}")

    retrieval_start = time.monotonic()
    cached_evidence = EVIDENCE_CACHE.get(evidence_key)
    if cached_evidence is not None:
        cache_hit["evidence"] = True
        retrieved = cached_evidence["filtered"]
        relevance_debug = cached_evidence["debug"]
        filter_ms = cached_evidence.get("filter_ms", 0.0)
    else:
        raw = _multi_query_retrieve(
            queries=base_queries,
            per_query=per_query,
            collection_key="core_textbooks",
        )
        filter_start = time.monotonic()
        retrieved, relevance_debug = _relevance_filter(chunks=raw, profile=profile, debug=debug)
        filter_ms = (time.monotonic() - filter_start) * 1000
        EVIDENCE_CACHE.set(evidence_key, {"filtered": retrieved, "debug": relevance_debug, "filter_ms": filter_ms})
    retrieval_ms = (time.monotonic() - retrieval_start) * 1000

    deduped, dedup_ms = _dedupe_ranked(retrieved)
    deduped = _cap_chunks(deduped, cap)
    trimmed = _truncate_chunks(deduped)

    bucket_counts_before = _coverage_bucket_counts(trimmed)
    missing_before = _missing_key_buckets(bucket_counts_before)
    missing_after = list(missing_before)

    fill_start = time.monotonic()
    retrieval_queries_used = list(base_queries)

    if missing_before:
        targeted_queries = [TARGETED_QUERY_MAP[m].format(topic=topic) for m in missing_before]
        retrieval_queries_used += targeted_queries
        raw_fill = _multi_query_retrieve(
            queries=targeted_queries,
            per_query=3,
            collection_key="core_textbooks",
        )
        fill_filtered, fill_debug = _relevance_filter(chunks=raw_fill, profile=profile, debug=debug)
        if debug:
            relevance_debug["raw_candidates"] += fill_debug.get("raw_candidates", [])
            relevance_debug["kept_evidence"] += fill_debug.get("kept_evidence", [])
            relevance_debug["dropped_evidence"] += fill_debug.get("dropped_evidence", [])
            relevance_debug["candidates_count"] += fill_debug.get("candidates_count", 0)
        combined = retrieved + fill_filtered
        combined_deduped, combined_dedup_ms = _dedupe_ranked(combined)
        dedup_ms += combined_dedup_ms
        combined_deduped = _cap_chunks(combined_deduped, cap)
        trimmed = _truncate_chunks(combined_deduped)
        bucket_counts_after = _coverage_bucket_counts(trimmed)
        missing_after = _missing_key_buckets(bucket_counts_after)
    else:
        bucket_counts_after = dict(bucket_counts_before)

    if missing_after and profile.get("aliases"):
        alias_queries: List[str] = []
        for alias in profile.get("aliases", [])[:2]:
            for key in missing_after:
                alias_queries.append(TARGETED_QUERY_MAP[key].format(topic=alias))
        retrieval_queries_used += alias_queries
        raw_alias = _multi_query_retrieve(
            queries=alias_queries,
            per_query=3,
            collection_key="core_textbooks",
        )
        alias_filtered, alias_debug = _relevance_filter(chunks=raw_alias, profile=profile, debug=debug)
        if debug:
            relevance_debug["raw_candidates"] += alias_debug.get("raw_candidates", [])
            relevance_debug["kept_evidence"] += alias_debug.get("kept_evidence", [])
            relevance_debug["dropped_evidence"] += alias_debug.get("dropped_evidence", [])
            relevance_debug["candidates_count"] += alias_debug.get("candidates_count", 0)
        combined = trimmed + alias_filtered
        combined_deduped, combined_dedup_ms = _dedupe_ranked(combined)
        dedup_ms += combined_dedup_ms
        combined_deduped = _cap_chunks(combined_deduped, cap)
        trimmed = _truncate_chunks(combined_deduped)
        bucket_counts_after = _coverage_bucket_counts(trimmed)
        missing_after = _missing_key_buckets(bucket_counts_after)

    fill_ms = (time.monotonic() - fill_start) * 1000

    evid_hash = evidence_hash(trimmed)
    transform_key = _cache_key("transform", f"{evid_hash}::{TRANSFORM_VERSION}")
    response_key = _cache_key("response", f"{topic}::{retrieval_hash}::{evid_hash}::{TRANSFORM_VERSION}::{UI_SCHEMA_VERSION}")

    if not debug:
        cached_response = RESPONSE_CACHE.get(response_key)
        if cached_response is not None:
            cache_hit["topic"] = True
            timings = cached_response.get("timings") or {}
            timings["cache_hit"] = cache_hit
            return {**cached_response, "timings": timings}

    llm_ms_total = 0.0
    transform_meta: Dict[str, Any] = {}

    if debug:
        doctor_view, llm_ms, transform_meta = await transform_topic(topic, trimmed)
        llm_ms_total += llm_ms
    else:
        doctor_view = TRANSFORM_CACHE.get(transform_key)
        if doctor_view is not None:
            cache_hit["transform"] = True
        else:
            doctor_view, llm_ms, transform_meta = await transform_topic(topic, trimmed)
            llm_ms_total += llm_ms
            TRANSFORM_CACHE.set(transform_key, doctor_view)

    repaired_chunks = transform_meta.get("repaired_chunks") or trimmed
    evidence_items = build_evidence_items(repaired_chunks)

    response: Dict[str, Any] = {
        "topic": topic,
        "doctor_view": doctor_view,
        "evidence": {"items": evidence_items, "hidden_by_default": True},
        "timings": {
            "cache_hit": cache_hit,
            "retrieval_ms": round(retrieval_ms, 2),
            "filter_ms": round(filter_ms, 2),
            "fill_ms": round(fill_ms, 2),
            "dedup_ms": round(dedup_ms, 2),
            "llm_ms": round(llm_ms_total, 2),
            "total_ms": round((time.monotonic() - start_total) * 1000, 2),
        },
    }

    if not debug:
        RESPONSE_CACHE.set(response_key, response)

    if debug:
        response["debug"] = {
            "retrieval_debug": {
                "candidates_count": relevance_debug.get("candidates_count", 0),
                "dropped_evidence": relevance_debug.get("dropped_evidence", []),
                "kept_evidence": relevance_debug.get("kept_evidence", []),
            },
            "coverage_debug": {
                "bucket_counts_before_fill": bucket_counts_before,
                "bucket_counts_after_fill": bucket_counts_after,
                "missing_key_buckets_before_fill": missing_before,
                "missing_key_buckets_after_fill": missing_after,
            },
            "thresholds_debug": {
                "thresholds_kept_count": transform_meta.get("thresholds_kept", 0),
                "thresholds_dropped_count": transform_meta.get("thresholds_dropped", 0),
                "thresholds_dropped_reasons": transform_meta.get("thresholds_dropped_reasons", []),
            },
            "evidence_debug": {
                "raw_first_lines": [_first_line(ch.get("raw_text") or "") for ch in retrieved],
                "cleaned_first_lines": [_first_line(ch.get("text") or "") for ch in trimmed],
                "repaired_first_lines": [_first_line(ch.get("text") or "") for ch in repaired_chunks],
                "dropped_chunks": relevance_debug.get("dropped_evidence", []),
                "repair_changes": transform_meta.get("repair_changes", []),
            },
            "section_debug": transform_meta.get("section_chunk_ids", {}),
            "retrieval_query_list": retrieval_queries_used,
            "evidence_hash": evid_hash,
            "evidence_count": len(repaired_chunks),
            "evidence_headings": [_first_line(ch.get("text") or "") for ch in repaired_chunks],
            "evidence_keywords_present": _keywords_in_evidence(repaired_chunks),
        }

    return response
