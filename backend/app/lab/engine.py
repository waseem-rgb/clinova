# Doctor-grade fixes: narrative filter + urine qual severity + B12 normalization + HDL low + DM severity
from __future__ import annotations

from typing import Any, Dict, List, Tuple

from app.lab.extract import infer_abnormalities, severity_from_value
from app.lab.patterns import build_patterns, coverage_gate


def _severity_rank(sev: str) -> int:
    order = {"CRITICAL": 5, "SEVERE": 4, "MODERATE": 3, "BORDERLINE": 2, "MILD": 1, "NORMAL": 0}
    return order.get(sev.upper(), 0)


def _abnormality_row(it: Dict[str, Any]) -> Dict[str, Any]:
    sev = severity_from_value(
        it.get("test", ""),
        it.get("value_num"),
        it.get("ref_low"),
        it.get("ref_high"),
        it.get("flag"),
        it.get("value_raw") or "",
        it.get("qualitative_status"),
    )
    return {
        "panel": it.get("panel") or "Other",
        "test": it.get("test") or "Unknown",
        "result": it.get("value_raw"),
        "unit": it.get("unit"),
        "range": it.get("ref_range_raw"),
        "flag": it.get("flag") or "",
        "severity": sev,
        "notes": "",
        "source_pages": [s.get("page") for s in it.get("sources") or [] if s.get("page")],
        "source_text": [s.get("text") for s in it.get("sources") or [] if s.get("text")],
    }


def build_response(
    extracted_tests: List[Dict[str, Any]],
    context: Dict[str, Any],
    include_evidence: bool,
) -> Dict[str, Any]:
    abnormalities_raw = infer_abnormalities(extracted_tests)
    abnormalities = [_abnormality_row(a) for a in abnormalities_raw]

    patterns = build_patterns(abnormalities_raw, context)
    all_addressed, missing = coverage_gate(abnormalities_raw, patterns)
    if missing:
        patterns.append(
            {
                "title": "Unmapped abnormalities (review required)",
                "summary": "Some abnormalities did not map to a specific pattern; verify and interpret clinically.",
                "likely_conditions": ["Requires clinician review in context of full history/exam"],
                "red_flags": ["Worsening symptoms or rapid changes"],
                "next_investigations": [
                    {"test": "Repeat/confirm abnormal tests", "why": "Validate unexpected results", "what_it_helps": "Rule out error"},
                ],
                "addresses": missing,
            }
        )
        all_addressed = True

    for p in patterns:
        addresses = p.pop("addresses", [])
        if include_evidence:
            evidence = []
            for abn in abnormalities:
                if abn.get("test") in addresses:
                    pages = abn.get("source_pages") or []
                    snippets = abn.get("source_text") or []
                    for page, snippet in zip(pages, snippets):
                        evidence.append(
                            {
                                "book": "Lab Report",
                                "chapter": None,
                                "page": page,
                                "snippet": snippet[:500],
                            }
                        )
            p["evidence"] = evidence

    key_abn = sorted(abnormalities, key=lambda x: _severity_rank(x.get("severity", "")), reverse=True)[:6]
    likely_patterns = [{"title": p["title"], "severity_tag": "high" if "CRITICAL" in p["summary"].upper() else "medium"} for p in patterns[:4]]

    return {
        "extracted_tests": [
            {
                "panel": t.get("panel"),
                "test": t.get("test"),
                "value_raw": t.get("value_raw"),
                "value_num": t.get("value_num"),
                "unit": t.get("unit"),
                "ref_range_raw": t.get("ref_range_raw"),
                "ref_low": t.get("ref_low"),
                "ref_high": t.get("ref_high"),
                "flag": t.get("flag"),
                "source_page": t.get("source_page"),
                "source_text": t.get("source_text"),
            }
            for t in extracted_tests
        ],
        "executive_summary": {
            "key_abnormalities": [
                {
                    "test": a["test"],
                    "panel": a["panel"],
                    "value": a["result"],
                    "unit": a.get("unit"),
                    "severity": a["severity"],
                    "note": "",
                }
                for a in key_abn
            ],
            "likely_patterns": likely_patterns,
        },
        "abnormalities": [
            {
                "panel": a["panel"],
                "test": a["test"],
                "result": a["result"],
                "unit": a.get("unit"),
                "range": a["range"],
                "flag": a["flag"],
                "severity": a["severity"],
                "notes": a.get("notes", ""),
            }
            for a in abnormalities
        ],
        "patterns": [
            {
                "title": p["title"],
                "summary": p["summary"],
                "likely_conditions": p["likely_conditions"],
                "red_flags": p["red_flags"],
                "next_investigations": p["next_investigations"],
                **({"evidence": p.get("evidence")} if include_evidence else {}),
            }
            for p in patterns
        ],
        "coverage": {
            "all_addressed": all_addressed,
            "missing": missing,
        },
        "extracted_tests_count": len(extracted_tests),
        "abnormalities_count": len(abnormalities),
    }
