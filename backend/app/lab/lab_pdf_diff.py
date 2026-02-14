from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from typing import Dict, List, Tuple

import pdfplumber


VALUE_RE = re.compile(
    r"\b("
    r"-?\d+(?:\.\d+)?"
    r"|present|negative|positive|reactive|nonreactive|non-reactive|trace"
    r"|\+{1,4}"
    r")\b",
    re.IGNORECASE,
)

# Filter obvious non-test labels that appear near reference categories
EXCLUDE_KW = re.compile(
    r"(?i)\b("
    r"desirable|risk|borderline|pre-diabetic|diabetic|insufficiency|deficiency|optimal|near|elevated"
    r")\b"
)

EXCLUDE_EXACT = {
    "above",
    "female",
    "male",
    "normal",
    "ifcc",
}


def clean(s: str) -> str:
    s = (s or "").strip()
    s = re.sub(r"\s+", " ", s)
    return s


def norm_test(s: str) -> str:
    s = clean(s).lower()
    s = s.replace("–", "-").replace("—", "-")
    s = re.sub(r"\s*-\s*", " - ", s)
    s = re.sub(r"\s*/\s*", "/", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def looks_like_garbage_test(test: str, line: str) -> bool:
    tl = test.lower().strip()

    # Common narrative/heading garbage
    if tl.startswith(("interpretation", "method", "reference", "page", "note")):
        return True
    if tl.startswith(("from ", "(cid")):
        return True

    # Too long = sentence
    if len(test) > 70:
        return True

    # Category/risk labels, not tests
    if ":" in test:
        return True
    if EXCLUDE_KW.search(test):
        return True
    if tl in EXCLUDE_EXACT:
        return True

    # Must contain a letter
    if not re.search(r"[a-zA-Z]", test):
        return True

    # Very generic junk
    if tl in {"high", "low"}:
        return True

    # If line itself is clearly narrative
    if re.search(r"(?i)\b(recommended|concentrations|specimens|during pregnancy|remain low)\b", line):
        return True

    return False


def extract_tests_from_pdf(pdf_path: str) -> Tuple[Dict[str, List[int]], List[Tuple[int, str]]]:
    pages_by_test: Dict[str, List[int]] = defaultdict(list)
    kept_lines: List[Tuple[int, str]] = []

    with pdfplumber.open(pdf_path) as pdf:
        for pno, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            for raw in text.splitlines():
                line = clean(raw)
                if not line:
                    continue

                m = VALUE_RE.search(line)
                if not m:
                    continue

                prefix = clean(line[: m.start()])
                prefix = re.sub(r"[:\-–—]+$", "", prefix).strip()
                if len(prefix) < 2:
                    continue

                if looks_like_garbage_test(prefix, line):
                    continue

                key = norm_test(prefix)
                if pno not in pages_by_test[key]:
                    pages_by_test[key].append(pno)
                kept_lines.append((pno, line))

    return pages_by_test, kept_lines


def extract_tests_from_response(response_json_path: str) -> Dict[str, List[int]]:
    data = json.loads(open(response_json_path, "r", encoding="utf-8").read())
    tests = data.get("extracted_tests") or []
    out: Dict[str, List[int]] = defaultdict(list)

    for t in tests:
        name = t.get("test") or ""
        key = norm_test(name)
        p = t.get("source_page")
        if isinstance(p, int):
            if p not in out[key]:
                out[key].append(p)
        else:
            # unknown page; keep as empty marker
            if key not in out:
                out[key] = []

    return out


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: python3 tools/lab_pdf_diff.py <lab_report.pdf> <response.json>")
        return 2

    pdf_path = sys.argv[1]
    response_path = sys.argv[2]

    pdf_tests, _ = extract_tests_from_pdf(pdf_path)
    resp_tests = extract_tests_from_response(response_path)

    pdf_set = set(pdf_tests.keys())
    resp_set = set(resp_tests.keys())

    missing_in_response = sorted(pdf_set - resp_set)
    extra_in_response = sorted(resp_set - pdf_set)

    print("\n=== COUNTS ===")
    print("PDF tests:", len(pdf_set))
    print("Response extracted_tests:", len(resp_set))
    print("Missing in response:", len(missing_in_response))
    print("Extra in response:", len(extra_in_response))

    print("\n=== MISSING IN RESPONSE (PDF has it, response.json doesn't) ===")
    for k in missing_in_response:
        pages = ",".join(map(str, pdf_tests.get(k, [])))
        print(f"- {k}   (PDF pages: {pages})")

    print("\n=== EXTRA IN RESPONSE (response.json has it, PDF diff didn't find) ===")
    for k in extra_in_response:
        pages = ",".join(map(str, resp_tests.get(k, [])))
        print(f"- {k}   (response pages: {pages if pages else 'unknown'})")

    # Strong check for HbA1c presence
    hba_pdf = [k for k in pdf_set if re.search(r"\bhba1c\b", k, re.I)]
    hba_resp = [k for k in resp_set if re.search(r"\bhba1c\b", k, re.I)]
    print("\n=== HbA1c CHECK ===")
    print("PDF contains HbA1c keys:", hba_pdf)
    print("Response contains HbA1c keys:", hba_resp)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
