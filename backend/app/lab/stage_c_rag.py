from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple

import os


MAX_QUERIES = int(os.getenv("LAB_RAG_MAX_QUERIES", "6"))
TOP_K = int(os.getenv("LAB_RAG_TOP_K", "6"))
MIN_HITS = int(os.getenv("LAB_RAG_MIN_HITS", "2"))

# Use similarity derived from distance (Chroma returns distance; lower is better).
SIMILARITY_THRESHOLD = float(os.getenv("LAB_RAG_SIMILARITY_THRESHOLD", "0.55"))

COLLECTION_MAP = {
    "medicine": "medicine_harrison",
    "obgyn": "obgyn_dutta",
    "pediatrics": "pediatrics_oxford",
    "surgery": "surgery_oxford",
}


def _get(obj: Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _clean_str(val: Any) -> str:
    return str(val or "").strip()


def _list_dedupe(items: Iterable[str]) -> List[str]:
    seen = set()
    out: List[str] = []
    for it in items:
        k = it.strip().lower()
        if not k or k in seen:
            continue
        seen.add(k)
        out.append(it.strip())
    return out


def _abnormality_summary(abnormalities: List[Any]) -> List[str]:
    findings: List[str] = []
    for a in abnormalities:
        test = _clean_str(_get(a, "test"))
        value = _clean_str(_get(a, "value"))
        unit = _clean_str(_get(a, "unit"))
        flag = _clean_str(_get(a, "flag"))
        if not test or not value:
            continue
        unit_part = f" {unit}" if unit else ""
        findings.append(f"{test}: {value}{unit_part} ({flag})")
    return findings


def build_lab_patterns(abnormalities: List[Any], context: Any) -> List[Dict[str, Any]]:
    """
    Preview-grade pattern builder. Returns pattern dicts:
      {title, why_it_matters, supporting_findings}
    """
    findings = _abnormality_summary(abnormalities)

    patterns: List[Dict[str, Any]] = []

    has_protein = any(_clean_str(_get(a, "test")).lower() == "protein" for a in abnormalities)
    has_glucose = any(_clean_str(_get(a, "test")).lower() == "glucose" for a in abnormalities)
    renal_markers = [
        a for a in abnormalities
        if _clean_str(_get(a, "test")).lower() in ("creatinine", "urea", "bun")
        or "creatinine" in _clean_str(_get(a, "test")).lower()
    ]
    high_k = any(
        "potassium" in _clean_str(_get(a, "test")).lower()
        and _clean_str(_get(a, "flag")).lower() in ("high", "critical")
        for a in abnormalities
    )

    if high_k:
        patterns.append(
            {
                "title": "Possible hyperkalemia pattern",
                "why_it_matters": "May require urgent confirmation and ECG correlation depending on clinical context.",
                "supporting_findings": findings,
            }
        )

    if renal_markers or has_protein:
        patterns.append(
            {
                "title": "Renal/urine abnormality pattern",
                "why_it_matters": "Helps triage AKI vs CKD and guides follow-up testing.",
                "supporting_findings": findings,
            }
        )

    if has_glucose:
        patterns.append(
            {
                "title": "Glycosuria pattern",
                "why_it_matters": "May correlate with hyperglycemia or renal threshold changes.",
                "supporting_findings": findings,
            }
        )

    if not patterns:
        patterns.append(
            {
                "title": "No strong abnormality pattern detected (preview)",
                "why_it_matters": "Parser may miss values depending on report layout; proceed to verify extracted table.",
                "supporting_findings": findings if findings else ["No parsable abnormal values found."],
            }
        )

    return patterns


def _select_collection(context: Any) -> str:
    pregnancy = _clean_str(_get(context, "pregnancy", "")).lower()
    age = _get(context, "age", None)

    if pregnancy == "yes":
        return "obgyn"
    if isinstance(age, int) and age >= 0 and age <= 16:
        return "pediatrics"
    return "medicine"


def _anchors_from_abnormalities(abnormalities: List[Any]) -> List[str]:
    anchors: List[str] = []
    for a in abnormalities:
        test = _clean_str(_get(a, "test"))
        if test:
            anchors.append(test.lower())
    return _list_dedupe(anchors)


def propose_rag_queries(patterns: List[Dict[str, Any]], context: Any) -> List[Dict[str, Any]]:
    abnormalities = _get(context, "abnormalities", []) or []
    base_anchors = _anchors_from_abnormalities(abnormalities)
    collection = _select_collection(context)

    queries: List[Dict[str, Any]] = []
    seen = set()

    for p in patterns:
        title = _clean_str(p.get("title"))
        if not title:
            continue
        query = f"{title} lab findings"
        anchors = _list_dedupe([title.lower(), *base_anchors])
        key = (query, collection)
        if key in seen:
            continue
        seen.add(key)
        queries.append(
            {
                "query": query,
                "anchors": anchors[:8],
                "collection": collection,
            }
        )
        if len(queries) >= MAX_QUERIES:
            break

    return queries


def _score_to_similarity(score: Optional[float]) -> float:
    if score is None:
        return 0.0
    try:
        dist = float(score)
    except Exception:
        return 0.0
    if dist <= 1.0:
        return max(0.0, 1.0 - dist)
    return 1.0 / (1.0 + dist)


def run_lab_rag(queries: List[Dict[str, Any]], retriever) -> List[Dict[str, Any]]:
    bundles: List[Dict[str, Any]] = []

    for q in queries[:MAX_QUERIES]:
        query = _clean_str(q.get("query"))
        anchors = q.get("anchors") or []
        collection_key = _clean_str(q.get("collection") or "medicine")
        collection_name = COLLECTION_MAP.get(collection_key, COLLECTION_MAP["medicine"])

        hits: List[Dict[str, Any]] = []
        docs = retriever(collection_name, query, TOP_K)
        for d in docs[:TOP_K]:
            meta = d.get("metadata") or {}
            page = meta.get("page_number")
            if isinstance(page, int) and page < 0:
                page = None
            source = {
                "book": meta.get("book_title") or meta.get("book") or "Unknown",
                "chapter": meta.get("chapter") or meta.get("section") or "",
                "page": page if isinstance(page, int) else None,
                "collection": collection_key,
                "chunk_id": d.get("id"),
            }
            hits.append(
                {
                    "text": (d.get("text") or "").strip(),
                    "score": d.get("score"),
                    "source": source,
                }
            )

        bundles.append(
            {
                "query": query,
                "anchors": anchors,
                "hits": hits,
            }
        )

    return bundles


def coverage_gate_condition(candidate: Dict[str, Any], evidence_bundles: List[Dict[str, Any]]) -> Tuple[bool, List[str]]:
    anchors = [a.lower() for a in (candidate.get("anchors") or []) if a]
    if not anchors:
        return False, ["missing_anchors"]

    strong_hits = 0
    anchor_hit = False

    for bundle in evidence_bundles:
        for hit in bundle.get("hits") or []:
            similarity = _score_to_similarity(hit.get("score"))
            if similarity >= SIMILARITY_THRESHOLD:
                strong_hits += 1
                text = (hit.get("text") or "").lower()
                if any(a in text for a in anchors):
                    anchor_hit = True

    reasons: List[str] = []
    if strong_hits < MIN_HITS:
        reasons.append("insufficient_hit_count")
    if not anchor_hit:
        reasons.append("missing_anchor_match")

    return (len(reasons) == 0), reasons


def _candidate_conditions(abnormalities: List[Any]) -> List[Dict[str, Any]]:
    conditions: List[Dict[str, Any]] = []

    has_glucose = any(_clean_str(_get(a, "test")).lower() == "glucose" for a in abnormalities)
    renal_markers = [
        a for a in abnormalities
        if _clean_str(_get(a, "test")).lower() in ("creatinine", "urea", "bun")
        or "creatinine" in _clean_str(_get(a, "test")).lower()
    ]
    high_k = any(
        "potassium" in _clean_str(_get(a, "test")).lower()
        and _clean_str(_get(a, "flag")).lower() in ("high", "critical")
        for a in abnormalities
    )

    if high_k:
        conditions.append(
            {
                "condition": "Hyperkalemia (pattern)",
                "why_possible": "Elevated potassium detected in report.",
                "confidence": "preview",
                "anchors": ["potassium", "hyperkalemia"],
            }
        )

    if renal_markers or any(_clean_str(_get(a, "test")).lower() == "protein" for a in abnormalities):
        conditions.append(
            {
                "condition": "Kidney dysfunction / proteinuria (pattern)",
                "why_possible": "Renal markers/protein positivity detected.",
                "confidence": "preview",
                "anchors": ["creatinine", "proteinuria", "protein", "eGFR", "renal"],
            }
        )

    if has_glucose:
        conditions.append(
            {
                "condition": "Hyperglycemia / diabetes control issue (pattern)",
                "why_possible": "Glucose present in urine.",
                "confidence": "preview",
                "anchors": ["glucose", "glycosuria", "hyperglycemia"],
            }
        )

    return conditions


def _candidate_investigations(abnormalities: List[Any]) -> List[Dict[str, Any]]:
    tests: List[Dict[str, Any]] = []

    has_glucose = any(_clean_str(_get(a, "test")).lower() == "glucose" for a in abnormalities)
    renal_markers = [
        a for a in abnormalities
        if _clean_str(_get(a, "test")).lower() in ("creatinine", "urea", "bun")
        or "creatinine" in _clean_str(_get(a, "test")).lower()
    ]
    high_k = any(
        "potassium" in _clean_str(_get(a, "test")).lower()
        and _clean_str(_get(a, "flag")).lower() in ("high", "critical")
        for a in abnormalities
    )

    if high_k:
        tests.extend(
            [
                {
                    "test": "Repeat serum potassium (hemolysis check)",
                    "rationale": "Confirm true elevation vs sample artifact.",
                    "priority": "STAT",
                    "anchors": ["potassium", "hyperkalemia", "hemolysis"],
                },
                {
                    "test": "ECG",
                    "rationale": "Screen for conduction effects if potassium is high/critical.",
                    "priority": "STAT",
                    "anchors": ["ECG", "electrocardiogram", "potassium"],
                },
            ]
        )

    if renal_markers or any(_clean_str(_get(a, "test")).lower() == "protein" for a in abnormalities):
        tests.extend(
            [
                {
                    "test": "Serum creatinine + eGFR trend / baseline",
                    "rationale": "Interpret significance by comparing to prior values.",
                    "priority": "Urgent",
                    "anchors": ["creatinine", "eGFR", "renal"],
                },
                {
                    "test": "Urine albumin/creatinine ratio (ACR) or protein quantification",
                    "rationale": "Quantify proteinuria for risk and monitoring.",
                    "priority": "Routine",
                    "anchors": ["proteinuria", "albumin", "ACR"],
                },
            ]
        )

    if has_glucose:
        tests.extend(
            [
                {
                    "test": "Capillary glucose / fasting glucose",
                    "rationale": "Confirm current glycemic status.",
                    "priority": "Urgent",
                    "anchors": ["glucose", "hyperglycemia"],
                },
                {
                    "test": "HbA1c",
                    "rationale": "Assess longer-term glycemic control.",
                    "priority": "Routine",
                    "anchors": ["HbA1c", "glycemic"],
                },
            ]
        )

    return tests


def synthesize_outputs(
    patterns: List[Dict[str, Any]],
    evidence_bundles: List[Dict[str, Any]],
    context: Any,
) -> Dict[str, Any]:
    abnormalities = _get(context, "abnormalities", []) or []

    if not evidence_bundles:
        return {
            "conditions": [],
            "next_investigations": [],
            "confidence": "insufficient_coverage",
            "coverage_notes": ["no_evidence_bundles"],
        }

    conditions_out: List[Dict[str, Any]] = []
    investigations_out: List[Dict[str, Any]] = []
    coverage_notes: List[str] = []

    for cand in _candidate_conditions(abnormalities):
        ok, reasons = coverage_gate_condition(cand, evidence_bundles)
        if ok:
            conditions_out.append(
                {
                    "condition": cand["condition"],
                    "why_possible": cand["why_possible"],
                    "confidence": cand["confidence"],
                }
            )
        else:
            coverage_notes.append(f"condition:{cand['condition']}:{','.join(reasons)}")

    for cand in _candidate_investigations(abnormalities):
        ok, reasons = coverage_gate_condition(cand, evidence_bundles)
        if ok:
            investigations_out.append(
                {
                    "test": cand["test"],
                    "rationale": cand["rationale"],
                    "priority": cand["priority"],
                }
            )
        else:
            coverage_notes.append(f"investigation:{cand['test']}:{','.join(reasons)}")

    if not conditions_out and not investigations_out:
        return {
            "conditions": [],
            "next_investigations": [],
            "confidence": "insufficient_coverage",
            "coverage_notes": coverage_notes or ["no_candidates_passed_coverage_gate"],
        }

    return {
        "conditions": conditions_out,
        "next_investigations": investigations_out,
        "confidence": "ok",
        "coverage_notes": coverage_notes,
    }
