#!/usr/bin/env python3
from __future__ import annotations

import io
import json
import re
import sys
from typing import Any, Dict, List, Optional, Set, Tuple

import pdfplumber

# -----------------------------
# Utilities
# -----------------------------

def norm(s: str) -> str:
    s = (s or "").strip()
    s = re.sub(r"\s+", " ", s)
    s = s.replace("–", "-").replace("—", "-")
    return s.strip()

def norm_key(s: str) -> str:
    s = norm(s).lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

NUM_RE = re.compile(r"(?<![A-Za-z0-9])[-+]?\d+(?:\.\d+)?")
QUAL_RE = re.compile(r"\b(positive|negative|present|absent|reactive|non\s*reactive|trace)\b", re.I)

def has_result_token(s: str) -> bool:
    s2 = s.lower()
    if NUM_RE.search(s2):
        return True
    if QUAL_RE.search(s2):
        return True
    # urine dipstick patterns like +, ++, +++
    if re.search(r"\+\+?\+?", s2):
        return True
    return False

def looks_like_test_name(s: str) -> bool:
    s = norm(s)
    if not s:
        return False
    low = s.lower()

    # hard garbage filters
    if low.startswith("page ") or low.startswith("reported") or low.startswith("collected"):
        return False
    if low.startswith("method") or low.startswith("reference") or low.startswith("unit"):
        return False
    if low.startswith("from "):
        return False
    if len(s) <= 2:
        return False

    # require some letters
    if not re.search(r"[A-Za-z]", s):
        return False

    # common headings
    if low in {"test", "investigation", "result", "range", "reference range"}:
        return False

    return True


NOISE_PHRASES = [
    "patient name",
    "client name",
    "ref. doctor",
    "sample id",
    "remarks",
    "remark",
    "comment",
    "comments",
    "interpretation",
    "note",
    "page",
    "history",
    "clinical",
    "correlate",
    "recommended",
    "cause",
]

NOISE_SINGLE_TOKENS = {
    "serum",
    "plasma",
    "other findings",
    "appearance",
    "colour",
    "casts",
    "crystals",
    "bacteria",
    "yeast cells",
    "amorphous deposit",
    "ca -",
    "vitamin d total",
}


def is_noise_name(s: str) -> bool:
    s = norm(s)
    if not s:
        return True
    low = s.lower()
    if len(s) <= 2:
        return True
    if low in NOISE_SINGLE_TOKENS:
        return True
    if any(p in low for p in NOISE_PHRASES):
        return True
    if re.match(r"^[^a-z0-9]+$", low):
        return True
    if re.search(r"[A-Za-z]\\s*[-./]$", s):
        return True
    return False


# -----------------------------
# Candidate extraction from PDF
# -----------------------------

def extract_candidates_from_lines(text: str) -> Set[str]:
    """
    Very conservative:
    - line contains a result token (number/positive/negative/+++)
    - test name is the text before the first number or before a known qualitative token
    """
    out: Set[str] = set()
    if not text:
        return out

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for ln in lines:
        if not has_result_token(ln):
            continue

        # try: name before first number
        m = None
        for m_candidate in NUM_RE.finditer(ln):
            start = m_candidate.start()
            if start > 0 and ln[start - 1].isalpha():
                continue
            if start > 1 and ln[start - 1] == "-" and ln[start - 2].isalpha():
                continue
            m = m_candidate
            break
        name = ""
        if m:
            name = ln[: m.start()].strip(" :-\t")
            if re.search(r"[-/]\s*$", name):
                name = (name + m.group(0)).strip()
            if name.strip().upper() == "CA":
                name = f"{name} {m.group(0)}".strip()
        else:
            # name before qualitative keyword
            m2 = QUAL_RE.search(ln)
            if m2:
                name = ln[: m2.start()].strip(" :-\t")
            else:
                # name before pluses
                m3 = re.search(r"\+\+?\+?", ln)
                if m3:
                    name = ln[: m3.start()].strip(" :-\t")

        name = norm(name)
        if looks_like_test_name(name):
            out.add(name)
    return out


def extract_candidates_from_tables(page: pdfplumber.page.Page) -> Set[str]:
    """
    Extract candidate tests from detected tables.
    Heuristic: first column is usually the test name.
    """
    out: Set[str] = set()

    settings = {
        "vertical_strategy": "lines",
        "horizontal_strategy": "lines",
        "intersection_tolerance": 5,
        "snap_tolerance": 3,
        "join_tolerance": 3,
        "edge_min_length": 15,
        "min_words_vertical": 2,
        "min_words_horizontal": 1,
        "keep_blank_chars": False,
        "text_tolerance": 3,
    }

    try:
        tables = page.extract_tables(table_settings=settings) or []
    except Exception:
        tables = []

    for tbl in tables:
        for row in tbl or []:
            if not row:
                continue
            first = norm(row[0] if len(row) > 0 else "")
            if not looks_like_test_name(first):
                continue

            # require that row contains some result-like token in any other cell
            rest = " ".join(norm(c or "") for c in row[1:]) if len(row) > 1 else ""
            if has_result_token(rest):
                out.add(first)

    return out


def pdf_expected_tests(pdf_path: str) -> Set[str]:
    expected: Set[str] = set()
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            expected |= extract_candidates_from_lines(text)
            expected |= extract_candidates_from_tables(page)
    return {t for t in expected if not is_noise_name(t)}


# -----------------------------
# Response extraction
# -----------------------------

def response_extracted_tests(resp: Dict[str, Any]) -> Set[str]:
    tests = resp.get("extracted_tests") or resp.get("tests") or []
    out: Set[str] = set()
    for t in tests:
        name = norm(str(t.get("test") or ""))
        if looks_like_test_name(name) and not is_noise_name(name):
            out.add(name)
    return out

def response_abnormal_tests(resp: Dict[str, Any]) -> Set[str]:
    abn = resp.get("abnormalities") or []
    out: Set[str] = set()
    for a in abn:
        name = norm(str(a.get("test") or ""))
        if looks_like_test_name(name) and not is_noise_name(name):
            out.add(name)
    return out


# -----------------------------
# Main
# -----------------------------

def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: lab_pdf_diff.py <lab_report.pdf> <response.json>")
        return 2

    pdf_path = sys.argv[1]
    resp_path = sys.argv[2]

    with open(resp_path, "r", encoding="utf-8") as f:
        resp = json.load(f)

    expected = pdf_expected_tests(pdf_path)
    extracted = response_extracted_tests(resp)
    abnormal = response_abnormal_tests(resp)

    expected_k = {norm_key(x) for x in expected}
    extracted_k = {norm_key(x) for x in extracted}

    # Missing = expected in PDF but not extracted
    missing = sorted([x for x in expected if norm_key(x) not in extracted_k], key=norm_key)

    # Extra = extracted but not expected (useful to catch garbage)
    extra = sorted([x for x in extracted if norm_key(x) not in expected_k], key=norm_key)

    out = {
        "pdf_expected_count": len(expected),
        "response_extracted_count": len(extracted),
        "response_abnormalities_count": len(resp.get("abnormalities") or []),
        "missing_from_extracted_tests": missing,
        "extra_suspect_tests_in_response": extra,
        "abnormal_tests": sorted(list(abnormal), key=norm_key),
    }

    print(json.dumps(out, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
