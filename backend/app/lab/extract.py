# Doctor-grade fixes: narrative filter + urine qual severity + B12 normalization + HDL low + DM severity
from __future__ import annotations

import io
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import pdfplumber


@dataclass
class RangeParsed:
    low: Optional[float]
    high: Optional[float]
    raw: str


PANEL_KEYWORDS = {
    "CBC": ["cbc", "hemoglobin", "hb", "wbc", "rbc", "mcv", "mch", "mchc", "rdw", "platelet", "hematocrit", "haematocrit"],
    "Renal": ["creatinine", "urea", "bun", "egfr", "uric", "sodium", "potassium", "chloride", "bicarbonate"],
    "LFT": ["ast", "alt", "alp", "bilirubin", "ggt", "albumin", "protein", "sgot", "sgpt", "alkaline phosphatase", "gamma gt", "ggtp"],
    "Urine": ["urine", "u/a", "ketone", "protein", "glucose", "nitrite", "leukocyte", "specific gravity", "rbc", "wbc", "pus cell"],
    "Thyroid": ["tsh", "t3", "t4", "thyroid"],
    "Lipid": ["cholesterol", "triglyceride", "hdl", "ldl", "lipid", "vldl", "chol/hdl"],
    "Glucose": ["glucose", "hba1c", "average blood glucose"],
}

HEADER_JUNK = [
    "patient name",
    "patient id",
    "billing id",
    "specimen",
    "sample",
    "reported on",
    "doctor",
    "ref. doctor",
    "collection",
    "registration",
    "receiving time",
    "client",
    "client name",
    "method",
    "page ",
    "reference interval",
    "reference range",
    "unit",
    "result",
    "srf id",
    "dob",
    "date of birth",
]

QUAL_VALUES = ["negative", "positive", "reactive", "nonreactive", "present", "absent", "nil", "trace"]

IGNORE_TEST_KEYWORDS = [
    "srf id",
    "dob",
    "date of birth",
]

# These phrases appear in footnotes, narrative interpretation, method text, or comments — NOT test names.
GARBAGE_TEST_PHRASES = [
    "cause very high",
    "may also be found",
    "found in healthy",
    "very small amounts",
    "interpretation",
    "interpret",
    "comment",
    "note",
    "remarks",
    "remark",
    "method",
    "specimen",
    "sample",
    "reference",
    "interval",
    "page ",
    "ranges are",
    "this test",
    "clinical correlation",
    "cause",
    "levels",
    "report",
    "calculation",
    "derived",
]
GARBAGE_TEST_RE = re.compile(r"(?i)\b(" + "|".join(re.escape(x) for x in GARBAGE_TEST_PHRASES) + r")\b")

# Symbols that sometimes get extracted as “tests”
JUNK_TEST_ONLY_RE = re.compile(r"^[^A-Za-z0-9]+$")

# HARD LOCK: narrative/metadata words should never appear as "tests"
GARBAGE_TEST_PATTERNS = [
    r"^\s*from\s+\S+",  # "from 7-dehydrocholesterol ..."
    r"^technology\b",
    r"^above\b",
    r"^below\b",
    r"^\(?serum\)?$",
    r"^\(?plasma\)?$",
    r"^ref\.?\s*doctor\b",
    r"\bcause\b",
    r"\blevels?\b",
    r"\binterpret",
    r"\bcomment",
    r"\bnote\b",
    r"\bremarks?\b",
    r"\bmethod\b",
    r"\bspecimen\b",
    r"\bsample\b",
    r"\bpage\b",
    r"\breference\b",
    r"\brange\b",
    r"\binterval\b",
    r"\bcalculation\b",
    r"\bderived\b",
    r"\bsummary\b",
    r"\bobserved\b",
    r"\bunit\b",
    r"\bfound in healthy\b",
    r"\bmay also be found\b",
    r"\bshould\b",
    r"\boften\b",
    r"\bdue to\b",
    r"\bbecause\b",
    r"^[-–—•†‡*]+$",
]
GARBAGE_TEST_REGEX = re.compile("|".join(GARBAGE_TEST_PATTERNS), re.IGNORECASE)


def _clean_spaces(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def _normalize_pdf_symbols(s: str) -> str:
    """
    Some PDFs convert ≤ into £ or other glyphs via extraction.
    Also normalize dashes.
    """
    if not s:
        return ""
    s = s.replace("–", "-").replace("—", "-")
    # common bad glyphs we see in extracted lab PDFs:
    s = s.replace("£", "<=")  # often used instead of ≤ in extraction
    s = s.replace("≤", "<=").replace("≥", ">=")
    s = s.replace("µ", "u").replace("μ", "u")
    return s


def _to_float(x: str) -> Optional[float]:
    try:
        return float(x)
    except Exception:
        return None


def _all_numbers(s: str) -> List[float]:
    nums = re.findall(r"-?\d+(?:\.\d+)?", s or "")
    out: List[float] = []
    for n in nums:
        v = _to_float(n)
        if v is not None:
            out.append(v)
    return out


def _numeric_value_for_comparison(value_raw: str) -> Optional[float]:
    """
    If value is a range like '4-6', return the MAX (6) for abnormal checks.
    If value is a single number, return it.
    """
    s = _normalize_pdf_symbols(value_raw or "")
    nums = _all_numbers(s)
    if not nums:
        return None
    return max(nums)


def _looks_like_value(s: str) -> bool:
    if not s:
        return False
    s_l = _normalize_pdf_symbols(s).lower()
    if any(q in s_l for q in QUAL_VALUES):
        return True
    return bool(re.search(r"-?\d+(?:\.\d+)?", s_l))


def _looks_like_range(s: str) -> bool:
    if not s:
        return False
    s = _normalize_pdf_symbols(s)
    s_l = s.lower()
    return bool(
        re.search(r"-?\d+(?:\.\d+)?\s*-\s*-?\d+(?:\.\d+)?", s)
        or re.search(r"[<>]=?\s*-?\d+(?:\.\d+)?", s)
        or re.search(r"\b(upto|up to)\b\s*-?\d+(?:\.\d+)?", s_l)
        or re.search(r"\b(below|above|less than|greater than)\b\s*-?\d+(?:\.\d+)?", s_l)
    )


def _risk_upper_keyword_present(r_l: str) -> bool:
    if "risk" not in r_l:
        return False
    if "low risk" in r_l:
        return False
    return True


def _low_suffix_on_upper(r_l: str) -> bool:
    return bool(re.search(r"(<|<=)\s*-?\d+(?:\.\d+)?\s*low\b", r_l))


def _parse_range(rng: str, test_name: str = "") -> RangeParsed:
    """
    IMPORTANT:
    Different labs write ranges in many ways.

    We ONLY use what's in the report.

    Special handling for "risk" category strings:
    - "Very high Risk : >= 190"  => treat as HIGH threshold (abnormal if >190) => ref_high=190
    - "< 35 Low"                => treat as LOW threshold (abnormal if <35)  => ref_low=35
    - "Desirable : < 130"       => treat as HIGH limit (abnormal if >130)   => ref_high=130
    """
    r = _clean_spaces(_normalize_pdf_symbols(rng))
    if not r:
        return RangeParsed(low=None, high=None, raw="")

    r_l = r.lower()
    t_l = (test_name or "").lower()

    if re.search(r"\b19\s*-\s*9\b", t_l) and re.search(r"\b19\s*-\s*9\b", r_l):
        return RangeParsed(low=None, high=None, raw=r)

    # Upto / Up to X  => high=X
    m = re.search(r"\b(upto|up to)\b\s*(-?\d+(?:\.\d+)?)", r_l)
    if m:
        return RangeParsed(low=None, high=_to_float(m.group(2)), raw=r)

    # A - B
    m = re.search(r"(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)", r)
    if m:
        lo = _to_float(m.group(1))
        hi = _to_float(m.group(2))
        # Guard: if hi < lo, it's likely NOT a numeric range (e.g., CA 19-9)
        if lo is not None and hi is not None and hi < lo:
            return RangeParsed(low=None, high=None, raw=r)
        return RangeParsed(low=lo, high=hi, raw=r)

    # below/less than X  => high=X
    m = re.search(r"\b(below|less than)\b\s*(-?\d+(?:\.\d+)?)", r_l)
    if m:
        return RangeParsed(low=None, high=_to_float(m.group(2)), raw=r)

    # above/greater than X => low=X
    m = re.search(r"\b(above|greater than)\b\s*(-?\d+(?:\.\d+)?)", r_l)
    if m:
        return RangeParsed(low=_to_float(m.group(2)), high=None, raw=r)

    # <= X or < X
    m = re.search(r"(<=|<)\s*(-?\d+(?:\.\d+)?)", r)
    if m:
        num = _to_float(m.group(2))
        if num is None:
            return RangeParsed(low=None, high=None, raw=r)

        # If the text explicitly says "low" after the number (e.g. "< 35 Low")
        if _low_suffix_on_upper(r_l):
            return RangeParsed(low=num, high=None, raw=r)

        # Otherwise treat as upper bound (Desirable: <130, Normal:<150 etc.)
        return RangeParsed(low=None, high=num, raw=r)

    # >= X or > X
    m = re.search(r"(>=|>)\s*(-?\d+(?:\.\d+)?)", r)
    if m:
        num = _to_float(m.group(2))
        if num is None:
            return RangeParsed(low=None, high=None, raw=r)

        # If this looks like a "risk/high" category threshold (>=190 very high risk)
        # then abnormal is ABOVE the threshold, not below it.
        if _risk_upper_keyword_present(r_l):
            return RangeParsed(low=None, high=num, raw=r)

        # Otherwise, treat as lower bound (e.g. ">0.40" is "should be above")
        return RangeParsed(low=num, high=None, raw=r)

    return RangeParsed(low=None, high=None, raw=r)


def _panel_guess(test_name: str, fallback: str = "Other") -> str:
    t = (test_name or "").lower()
    for panel, keys in PANEL_KEYWORDS.items():
        if any(k in t for k in keys):
            return panel
    return fallback


def _is_header_line(line: str) -> bool:
    l = (line or "").lower()
    if re.search(r"page\s+\d+\s+of\s+\d+", l):
        return True
    return any(l.startswith(k) for k in HEADER_JUNK)


def _is_ignored_test_name(test_name: str) -> bool:
    t = (test_name or "").strip().lower()
    if not t:
        return True
    if any(k in t for k in IGNORE_TEST_KEYWORDS):
        return True
    if JUNK_TEST_ONLY_RE.match(test_name or ""):
        return True
    if t in {"†", "‡", "*", "•"}:
        return True
    return False


def _qualitative_status(value_raw: str) -> Optional[str]:
    if not value_raw:
        return None
    v = _clean_spaces(_normalize_pdf_symbols(value_raw)).lower()
    if re.search(r"\b(positive|reactive|present|detected)\b", v):
        return "POSITIVE"
    if re.search(r"\b(nonreactive|negative|absent|nil)\b", v):
        return "NEGATIVE"
    if "trace" in v:
        return "TRACE"
    if re.search(r"\+\+?\+?", v):
        return "POSITIVE"
    return None


def _is_narrative_or_interpretation_line(line: str) -> bool:
    l = _clean_spaces(line or "")
    if not l:
        return False
    l_low = l.lower()

    if len(re.split(r"\s{2,}", line)) >= 2:
        return False

    m = VALUE_TOKEN.search(l)
    if m:
        candidate = _clean_spaces(l[: m.start()])
        if candidate and len(candidate) <= 40 and len(candidate.split()) <= 6 and re.search(r"[A-Za-z]", candidate):
            return False

    narrative_markers = [
        "interpretation",
        "comment",
        "note",
        "cause",
        "may also",
        "patients",
        "history",
        "clinical",
        "correlate",
        "recommended",
        "assessed",
        "useful for",
        "evaluation",
        "suggest",
        "suggested",
        "method",
        "reference interval",
        "reference range",
    ]

    if any(m in l_low for m in narrative_markers) and len(l) > 35:
        return True

    if len(l) > 90 and re.search(r"[.;:]", l) and not re.search(r"\s{2,}", line):
        return True

    return False


def _garbage_reason(test_name: str, source_text: str = "") -> Optional[str]:
    """
    HARD garbage filter:
    - drop narrative/footnote/metadata “tests” (e.g., 'cause very high CA', 'from 7-dehydro...')
    - drop sentence-like long strings
    - drop symbol-only tokens
    """
    t = _clean_spaces(test_name or "")
    if not t:
        return "empty_test"

    tl = t.lower()
    st = _clean_spaces(source_text or "")
    combined = (t + " " + st).strip().lower()
    is_short_test = len(tl) <= 30 and len(tl.split()) <= 6
    has_value_in_source = bool(VALUE_TOKEN.search(source_text or ""))

    # fast-kill narrative prefixes
    if tl.startswith("from "):
        return "narrative_from_prefix"

    # pure symbols
    if JUNK_TEST_ONLY_RE.match(t):
        return "symbols_only"

    # hard lock patterns (avoid penalizing real test lines with values + trailing reference/method)
    if GARBAGE_TEST_REGEX.search(tl):
        return "garbage_pattern"
    if (not is_short_test) and (not has_value_in_source) and GARBAGE_TEST_REGEX.search(combined):
        return "garbage_pattern"

    # phrase list backstop
    if GARBAGE_TEST_RE.search(tl):
        return "garbage_phrase"
    if (not is_short_test) and (not has_value_in_source) and GARBAGE_TEST_RE.search(combined):
        return "garbage_phrase"

    # sentence-like lines are garbage
    if len(tl) >= 28 and len(tl.split()) >= 5:
        sentence_markers = [" may ", " can ", " could ", " found ", " cause ", " causes ", " also ", " very "]
        if any(m in f" {tl} " for m in sentence_markers):
            return "sentence_like"

    if re.match(r"^\d", tl) and _looks_like_unit(tl):
        return "range_only_token"

    return None


def _is_garbage_test_name(test_name: str, source_text: str = "") -> bool:
    return _garbage_reason(test_name, source_text) is not None


def _record_garbage_drop(
    debug: Dict[str, Any],
    candidate_test: str,
    source_text: str,
    reason: str,
) -> None:
    debug["dropped_garbage_count"] = debug.get("dropped_garbage_count", 0) + 1
    examples = debug.setdefault("garbage_dropped_examples", [])
    if len(examples) >= 20:
        return
    examples.append(
        {
            "candidate_test": candidate_test,
            "source_text": source_text,
            "reason": reason,
        }
    )


def _record_range_example(
    debug: Dict[str, Any],
    test: str,
    ref_range_raw: str,
    ref_low: Optional[float],
    ref_high: Optional[float],
    page_num: int,
) -> None:
    if not ref_range_raw:
        return
    if not re.search(r"(risk|desirable|low|>=|<=|<|>|below|upto|up to)", ref_range_raw.lower()):
        return
    examples = debug.setdefault("range_parse_examples", [])
    if len(examples) >= 50:
        return
    examples.append(
        {
            "test": test,
            "ref_range_raw": ref_range_raw,
            "parsed_low": ref_low,
            "parsed_high": ref_high,
            "source_page": page_num,
        }
    )


def _record_narrative_drop(debug: Dict[str, Any], line: str) -> None:
    debug["lines_dropped_narrative_count"] = debug.get("lines_dropped_narrative_count", 0) + 1
    examples = debug.setdefault("sample_dropped_narrative_lines", [])
    if len(examples) >= 10:
        return
    examples.append(_clean_spaces(line)[:200])


def _detect_panel_heading(line: str) -> Optional[str]:
    l = (line or "").lower()
    for panel, keys in PANEL_KEYWORDS.items():
        if panel.lower() in l:
            return panel
        if sum(1 for k in keys if k in l) >= 2:
            return panel
    if (line or "").isupper() and len((line or "").split()) <= 4:
        for panel in PANEL_KEYWORDS:
            if panel.lower() in l:
                return panel
    return None


def _normalize_flag(raw: str) -> Optional[str]:
    if not raw:
        return None
    r = raw.strip().lower()
    if r in {"h", "high"}:
        return "H"
    if r in {"l", "low"}:
        return "L"
    if "critical" in r or r == "c":
        return "CRITICAL"
    return None


def _looks_like_unit(token: str) -> bool:
    t = (token or "").lower()
    if any(u in t for u in ["mg", "g", "mmol", "umol", "iu", "u/l", "ng", "pg", "ml", "dl", "%", "cells", "x10", "10^", "/hpf", "/l", "/dl", "/ml"]):
        return True
    return bool(re.search(r"/|\^", t))


def _split_trailing_value_from_test(test: str, value_raw: str, unit: str) -> Tuple[str, str, str]:
    t = _clean_spaces(test)
    if not t:
        return test, value_raw, unit
    m = re.search(r"^(.*?)(-?\d+(?:\.\d+)?)$", t)
    if not m:
        return test, value_raw, unit
    if value_raw and _looks_like_unit(value_raw):
        new_test = _clean_spaces(m.group(1))
        new_value = m.group(2)
        new_unit = unit or value_raw
        return new_test, new_value, new_unit
    return test, value_raw, unit


def _extract_from_table_row(
    row: List[str],
    header_map: Dict[str, int],
    panel: Optional[str],
    page_num: int,
    debug: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    test_idx = header_map.get("test")
    value_idx = header_map.get("value")
    unit_idx = header_map.get("unit")
    range_idx = header_map.get("range")
    flag_idx = header_map.get("flag")

    if test_idx is None or value_idx is None:
        if len(row) >= 2 and _looks_like_value(row[1]):
            test_idx = 0
            value_idx = 1
            unit_idx = 2 if len(row) > 2 and not _looks_like_range(row[2]) else None
            range_idx = 3 if len(row) > 3 and _looks_like_range(row[3]) else None
            flag_idx = 4 if len(row) > 4 else None
        else:
            return None

    if test_idx >= len(row) or value_idx >= len(row):
        return None

    test = _clean_spaces(row[test_idx])
    value_raw = _clean_spaces(row[value_idx])

    if not test or not value_raw:
        return None
    if _is_header_line(test) or _is_ignored_test_name(test):
        return None

    source_text = " | ".join([c for c in row if c])
    reason = _garbage_reason(test, source_text)
    if reason:
        _record_garbage_drop(debug, test, source_text, reason)
        return None

    unit = _clean_spaces(row[unit_idx]) if unit_idx is not None and unit_idx < len(row) else ""
    ref_range_raw = _clean_spaces(row[range_idx]) if range_idx is not None and range_idx < len(row) else ""
    flag_raw = _clean_spaces(row[flag_idx]) if flag_idx is not None and flag_idx < len(row) else ""

    ref = _parse_range(ref_range_raw, test)
    flag = _normalize_flag(flag_raw)
    value_num = _numeric_value_for_comparison(value_raw)
    qual_status = _qualitative_status(value_raw)
    _record_range_example(debug, test, ref_range_raw, ref.low, ref.high, page_num)

    return {
        "panel": panel or _panel_guess(test),
        "test": test,
        "value_raw": value_raw,
        "value_num": value_num,
        "unit": unit or None,
        "ref_range_raw": ref_range_raw or None,
        "ref_low": ref.low,
        "ref_high": ref.high,
        "flag": flag,
        "qualitative_status": qual_status,
        "source_page": page_num,
        "source_text": source_text,
    }


def _header_map_from_row(row: List[str]) -> Dict[str, int]:
    header_map: Dict[str, int] = {}
    for idx, cell in enumerate(row):
        c = (cell or "").lower()
        if any(k in c for k in ["test", "parameter", "investigation"]):
            header_map["test"] = idx
        if any(k in c for k in ["value", "result", "observed"]):
            header_map["value"] = idx
        if "unit" in c:
            header_map["unit"] = idx
        if any(k in c for k in ["range", "reference", "interval"]):
            header_map["range"] = idx
        if any(k in c for k in ["flag", "abnormal", "remark"]):
            header_map["flag"] = idx
    return header_map


def _extract_from_tables(pdf: pdfplumber.PDF, debug: Dict[str, Any]) -> List[Dict[str, Any]]:
    extracted: List[Dict[str, Any]] = []

    for page in pdf.pages:
        page_num = page.page_number
        try:
            tables = page.extract_tables() or []
        except Exception:
            tables = []

        for tbl in tables:
            if not tbl or len(tbl) < 2:
                continue

            norm = [[_clean_spaces(c or "") for c in row] for row in tbl]
            header_map: Dict[str, int] = {}
            panel: Optional[str] = None

            for idx, row in enumerate(norm[:2]):
                header_map = _header_map_from_row(row)
                if header_map.get("test") is not None and header_map.get("value") is not None:
                    start_idx = idx + 1
                    break
            else:
                start_idx = 0

            for row in norm[start_idx:]:
                if not any(row):
                    continue
                if len([c for c in row if c]) == 1:
                    maybe_panel = _detect_panel_heading(row[0])
                    if maybe_panel:
                        panel = maybe_panel
                    continue

                item = _extract_from_table_row(row, header_map, panel, page_num, debug)
                if item:
                    extracted.append(item)

        debug["table_pages"].append({"page": page_num, "tables": len(tables)})

    return extracted


VALUE_TOKEN = re.compile(
    r"(?i)\b(-?\d+(?:\.\d+)?|negative|positive|reactive|nonreactive|present|absent|nil|trace|[0-4]\+)\b"
)


def _parse_line_columns(line: str) -> List[str]:
    cols = [c.strip() for c in re.split(r"\s{2,}", line) if c.strip()]
    if len(cols) >= 2:
        return cols
    return []


def _extract_from_lines(pdf: pdfplumber.PDF, debug: Dict[str, Any]) -> List[Dict[str, Any]]:
    extracted: List[Dict[str, Any]] = []

    for page in pdf.pages:
        page_num = page.page_number
        text = page.extract_text() or ""
        text = _normalize_pdf_symbols(text)
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        panel: Optional[str] = None
        matched = 0

        for line in lines:
            if _is_header_line(line):
                continue
            if _is_ignored_test_name(line):
                continue
            if _is_narrative_or_interpretation_line(line):
                _record_narrative_drop(debug, line)
                continue

            maybe_panel = _detect_panel_heading(line)
            if maybe_panel:
                panel = maybe_panel
                continue

            cols = _parse_line_columns(line)
            if cols:
                test = cols[0]
                value_raw = cols[1] if len(cols) > 1 else ""
                unit = cols[2] if len(cols) > 2 and _looks_like_unit(cols[2]) else ""
                ref_range_raw = cols[3] if len(cols) > 3 and _looks_like_range(cols[3]) else ""
                flag_raw = cols[4] if len(cols) > 4 else ""
            else:
                m = VALUE_TOKEN.search(line)
                if not m:
                    continue
                test = _clean_spaces(line[: m.start()])
                if not test:
                    continue
                value_raw = _clean_spaces(m.group(1))
                remainder = _clean_spaces(line[m.start() :])
                tokens = remainder.split()
                unit = tokens[1] if len(tokens) > 1 and _looks_like_unit(tokens[1]) else ""
                rest = " ".join(tokens[2:]) if unit else " ".join(tokens[1:])

                range_match = re.search(
                    r"(-?\d+(?:\.\d+)?\s*[-]\s*-?\d+(?:\.\d+)?|[<>]=?\s*-?\d+(?:\.\d+)?|\b(upto|up to|below|above|less than|greater than)\b\s*-?\d+(?:\.\d+)?)",
                    rest,
                    re.IGNORECASE,
                )
                ref_range_raw = _clean_spaces(range_match.group(1)) if range_match else ""
                if not ref_range_raw and any(q in rest.lower() for q in ["negative", "nonreactive", "reactive", "positive"]):
                    ref_range_raw = "Negative"
                flag_raw = ""
                flag_match = re.search(r"\b(H|L|High|Low|Critical)\b", rest, re.IGNORECASE)
                if flag_match:
                    flag_raw = flag_match.group(1)

            test = _clean_spaces(test)
            value_raw = _clean_spaces(value_raw)
            if not test or _is_ignored_test_name(test) or not value_raw or not _looks_like_value(value_raw):
                continue
            reason = _garbage_reason(test, line)
            if reason:
                _record_garbage_drop(debug, test, line, reason)
                continue

            ref = _parse_range(ref_range_raw, test)
            flag = _normalize_flag(flag_raw)
            value_num = _numeric_value_for_comparison(value_raw)
            qual_status = _qualitative_status(value_raw)
            _record_range_example(debug, test, ref_range_raw, ref.low, ref.high, page_num)

            extracted.append(
                {
                    "panel": panel or _panel_guess(test),
                    "test": test,
                    "value_raw": value_raw,
                    "value_num": value_num,
                    "unit": unit or None,
                    "ref_range_raw": ref_range_raw or None,
                    "ref_low": ref.low,
                    "ref_high": ref.high,
                    "flag": flag,
                    "qualitative_status": qual_status,
                    "source_page": page_num,
                    "source_text": line,
                }
            )
            matched += 1

        debug["line_pages"].append({"page": page_num, "lines": len(lines), "matched": matched})

    return extracted


def _extract_from_words(pdf: pdfplumber.PDF, debug: Dict[str, Any]) -> List[Dict[str, Any]]:
    extracted: List[Dict[str, Any]] = []

    for page in pdf.pages:
        page_num = page.page_number
        words = page.extract_words(x_tolerance=1, y_tolerance=1) or []
        if not words:
            continue

        lines: List[List[Dict[str, Any]]] = []
        for w in sorted(words, key=lambda x: (x["top"], x["x0"])):
            if not lines or abs(lines[-1][0]["top"] - w["top"]) > 3:
                lines.append([w])
            else:
                lines[-1].append(w)

        matched = 0
        panel: Optional[str] = None
        for line_words in lines:
            line_words = sorted(line_words, key=lambda x: x["x0"])
            parts: List[List[str]] = [[]]
            last_x = line_words[0]["x0"]

            for w in line_words:
                gap = w["x0"] - last_x
                if gap > 18:
                    parts.append([])
                parts[-1].append(w["text"])
                last_x = w["x1"]

            cols = [_clean_spaces(" ".join(p)) for p in parts if _clean_spaces(" ".join(p))]
            if not cols:
                continue

            line_text = " ".join(cols)
            if _is_narrative_or_interpretation_line(line_text):
                _record_narrative_drop(debug, line_text)
                continue

            if len(cols) == 1:
                maybe_panel = _detect_panel_heading(cols[0])
                if maybe_panel:
                    panel = maybe_panel
                continue

            header_line = " ".join(cols).lower()
            if any(k in header_line for k in ["test done", "observed value", "ref. interval", "unit"]):
                continue
            if _is_header_line(header_line):
                continue

            test = _clean_spaces(cols[0])
            value_raw = _clean_spaces(cols[1] if len(cols) > 1 else "")
            unit = ""
            ref_range_raw = ""
            flag_raw = ""

            if len(cols) > 2:
                c2 = _normalize_pdf_symbols(cols[2])
                if _looks_like_range(c2) or any(k in c2.lower() for k in ["low", "high", "risk", "desirable", "negative", "nonreactive", "positive", "reactive", "upto", "up to"]):
                    ref_range_raw = cols[2]
                elif _looks_like_unit(c2):
                    unit = cols[2]
                else:
                    unit = cols[2]

            if len(cols) > 3:
                c3 = _normalize_pdf_symbols(cols[3])
                if (not ref_range_raw) and (_looks_like_range(c3) or any(k in c3.lower() for k in ["low", "high", "risk", "desirable", "below", "above", "upto", "up to"])):
                    ref_range_raw = cols[3]
                elif not unit and _looks_like_unit(c3):
                    unit = cols[3]

            if len(cols) > 4:
                flag_raw = cols[4]

            test, value_raw, unit = _split_trailing_value_from_test(test, value_raw, unit)

            if not test or not value_raw:
                continue
            if _is_ignored_test_name(test):
                continue

            source_text = " | ".join(cols)
            reason = _garbage_reason(test, source_text)
            if reason:
                _record_garbage_drop(debug, test, source_text, reason)
                continue

            ref = _parse_range(ref_range_raw, test)
            flag = _normalize_flag(flag_raw)
            value_num = _numeric_value_for_comparison(value_raw)
            qual_status = _qualitative_status(value_raw)
            _record_range_example(debug, test, ref_range_raw, ref.low, ref.high, page_num)

            extracted.append(
                {
                    "panel": panel or _panel_guess(test),
                    "test": test,
                    "value_raw": value_raw,
                    "value_num": value_num,
                    "unit": unit or None,
                    "ref_range_raw": ref_range_raw or None,
                    "ref_low": ref.low,
                    "ref_high": ref.high,
                    "flag": flag,
                    "qualitative_status": qual_status,
                    "source_page": page_num,
                    "source_text": source_text,
                }
            )
            matched += 1

        debug["word_pages"].append({"page": page_num, "lines": len(lines), "matched": matched})

    return extracted


def _dedupe_tests(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_key: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
    for it in items:
        key = (
            (it.get("test") or "").lower(),
            (it.get("unit") or "").lower(),
            str(it.get("ref_low")) + ":" + str(it.get("ref_high")),
        )
        existing = by_key.get(key)
        if not existing:
            it["sources"] = [{"page": it.get("source_page"), "text": it.get("source_text")}]
            by_key[key] = it
            continue

        existing["sources"].append({"page": it.get("source_page"), "text": it.get("source_text")})
        if (it.get("source_page") or 0) >= (existing.get("source_page") or 0):
            for k in ["value_raw", "value_num", "unit", "ref_range_raw", "ref_low", "ref_high", "flag", "panel", "source_page", "source_text", "qualitative_status"]:
                existing[k] = it.get(k)

    return list(by_key.values())


def extract_tests_from_pdfs(pdf_bytes_list: List[bytes]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    debug: Dict[str, Any] = {
        "table_pages": [],
        "line_pages": [],
        "word_pages": [],
        "warnings": [],
        "range_parse_examples": [],
        "garbage_dropped_examples": [],
        "dropped_garbage_count": 0,
        "lines_dropped_narrative_count": 0,
        "sample_dropped_narrative_lines": [],
        "urine_qual_positive_count": 0,
    }
    extracted: List[Dict[str, Any]] = []

    for b in pdf_bytes_list:
        try:
            with pdfplumber.open(io.BytesIO(b)) as pdf:
                extracted.extend(_extract_from_tables(pdf, debug))
                extracted.extend(_extract_from_words(pdf, debug))
                extracted.extend(_extract_from_lines(pdf, debug))
        except Exception as e:
            debug["warnings"].append(str(e))

    extracted = _dedupe_tests(extracted)

    urine_positive = 0
    for it in extracted:
        if (it.get("panel") or "").lower() == "urine":
            if it.get("qualitative_status") == "POSITIVE":
                urine_positive += 1
    debug["urine_qual_positive_count"] = urine_positive

    return extracted, debug


def infer_abnormalities(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Non-negotiable:
    - Do not miss qualitative abnormals (Positive/Reactive/Present/Trace or +/++/+++).
    - Numeric abnormal only when we can compare to a real bound (ref_low/ref_high parsed).
    - Remove narrative/footnote garbage.
    """
    abnormalities: List[Dict[str, Any]] = []

    for it in items:
        test = (it.get("test") or "").strip()
        source_text = (it.get("source_text") or "").strip()
        if _is_header_line(test) or _is_ignored_test_name(test) or _is_garbage_test_name(test, source_text):
            continue

        flag = it.get("flag") or None
        value_raw = (it.get("value_raw") or "").strip()
        ref_range_raw = (it.get("ref_range_raw") or "").strip()
        value_num = it.get("value_num")
        ref_low = it.get("ref_low")
        ref_high = it.get("ref_high")
        qual_status = it.get("qualitative_status") or _qualitative_status(value_raw)

        vlow = value_raw.lower()

        # Force-detect inline H/L markers in value text (maximize recall)
        if not flag:
            if re.search(r"\bhigh\b", vlow) and "hplc" not in vlow:
                flag = "H"
            elif re.search(r"\blow\b", vlow) and "hplc" not in vlow:
                flag = "L"
            elif re.search(r"\bH\b", value_raw) and "HPLC" not in value_raw:
                flag = "H"
            elif re.search(r"\bL\b", value_raw):
                flag = "L"

        # Qualitative abnormal signals
        is_qual_abnormal = False
        if qual_status in {"POSITIVE", "TRACE"}:
            is_qual_abnormal = True
            flag = flag or "H"

        is_qual_abnormal = is_qual_abnormal or (
            any(q in vlow for q in ["positive", "reactive", "present", "trace"])
            or bool(re.search(r"\b[1-4]\+\b", vlow))
            or "++" in vlow
            or "+++" in vlow
        )

        if is_qual_abnormal and not flag:
            flag = "H"

        # Special: if reference says "Absent/Nil/Negative" and we have a numeric/counted value => abnormal
        rr_l = ref_range_raw.lower()
        is_absent_ref = any(x in rr_l for x in ["absent", "nil", "negative"])
        has_any_number = bool(re.search(r"\d", value_raw))
        if is_absent_ref and has_any_number and not any(q in vlow for q in ["negative", "nil", "absent"]):
            is_qual_abnormal = True
            flag = flag or "H"

        cmp_val = value_num if value_num is not None else _numeric_value_for_comparison(value_raw)

        # If ref bounds exist and value is within range, do not keep H/L flags
        if cmp_val is not None and (ref_low is not None or ref_high is not None):
            within_low = ref_low is None or cmp_val >= ref_low
            within_high = ref_high is None or cmp_val <= ref_high
            if within_low and within_high and flag in {"H", "L"} and not is_qual_abnormal:
                flag = None

        is_numeric_abnormal = False
        if cmp_val is not None and (ref_low is not None or ref_high is not None):
            if ref_low is not None and cmp_val < ref_low:
                is_numeric_abnormal = True
                flag = flag or "L"
            if ref_high is not None and cmp_val > ref_high:
                is_numeric_abnormal = True
                flag = flag or "H"

        if flag in {"H", "L", "CRITICAL"} or is_qual_abnormal or is_numeric_abnormal:
            if flag:
                it["flag"] = flag
            if qual_status:
                it["qualitative_status"] = qual_status
            abnormalities.append(it)

    return abnormalities


def severity_from_value(
    test_name: str,
    value_num: Optional[float],
    ref_low: Optional[float],
    ref_high: Optional[float],
    flag: Optional[str],
    value_raw: str,
    qualitative_status: Optional[str] = None,
) -> str:
    if flag == "CRITICAL":
        return "CRITICAL"

    if qualitative_status in {"POSITIVE", "TRACE"}:
        return "MODERATE"

    v = value_num if value_num is not None else _numeric_value_for_comparison(value_raw)
    t = (test_name or "").lower()

    if v is not None and "hba1c" in t:
        if v < 6.0:
            return "NORMAL"
        if v < 7.0:
            return "MILD"
        if v < 8.0:
            return "MODERATE"
        if v < 10.0:
            return "SEVERE"
        return "CRITICAL"

    if v is not None and "glucose" in t and "urine" not in t:
        if v <= 100:
            return "NORMAL"
        if v <= 125:
            return "MILD"
        if v < 200:
            return "MODERATE"
        return "SEVERE"

    if any(q in (value_raw or "").lower() for q in ["positive", "reactive", "present", "trace", "++", "+++"]):
        return "MODERATE"

    if v is None or (ref_low is None and ref_high is None):
        return "MILD" if flag in {"H", "L"} else "NORMAL"

    if ref_high is not None and v > ref_high:
        over = (v - ref_high) / max(abs(ref_high), 1e-6)
        if over <= 0.1:
            return "BORDERLINE"
        if over <= 0.25:
            return "MODERATE"
        return "SEVERE"

    if ref_low is not None and v < ref_low:
        under = (ref_low - v) / max(abs(ref_low), 1e-6)
        if under <= 0.1:
            return "BORDERLINE"
        if under <= 0.25:
            return "MODERATE"
        return "SEVERE"

    return "NORMAL"
