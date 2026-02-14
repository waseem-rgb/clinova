#!/usr/bin/env python3
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.lab.extract import extract_tests_from_pdfs, infer_abnormalities, _is_garbage_test_name  # noqa: E402


def _read_pdf_bytes(path: Path) -> bytes:
    with path.open("rb") as f:
        return f.read()


def _find_ldl(entries):
    for it in entries:
        name = (it.get("test") or "").lower()
        if "ldl" in name and "cholesterol" in name:
            return it
    return None


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python3 backend/scripts/lab_smoke_check.py /path/to/lab_report.pdf")
        return 1

    pdf_path = Path(sys.argv[1])
    if not pdf_path.exists():
        print(f"File not found: {pdf_path}")
        return 1

    pdf_bytes = _read_pdf_bytes(pdf_path)
    extracted, debug = extract_tests_from_pdfs([pdf_bytes])
    abnormalities = infer_abnormalities(extracted)

    print(f"Extracted tests: {len(extracted)}")
    print(f"Abnormalities: {len(abnormalities)}")

    abnormal_tests = sorted({(a.get("test") or "").strip() for a in abnormalities if a.get("test")})
    print("Abnormal test names:")
    for t in abnormal_tests:
        print(f"- {t}")

    garbage_hits = []
    for it in extracted:
        test = (it.get("test") or "").strip()
        if not test:
            continue
        if _is_garbage_test_name(test, it.get("source_text") or ""):
            garbage_hits.append(test)

    if garbage_hits:
        print("Garbage-like tests detected:")
        for t in sorted(set(garbage_hits)):
            print(f"- {t}")
    else:
        print("Garbage-like tests detected: none")

    ldl = _find_ldl(extracted)
    if ldl:
        ldl_name = ldl.get("test")
        ldl_value = ldl.get("value_raw")
        ldl_low = ldl.get("ref_low")
        ldl_high = ldl.get("ref_high")
        ldl_abnormal = any((a.get("test") or "").strip() == ldl_name for a in abnormalities)
        print("LDL check:")
        print(f"- test: {ldl_name}")
        print(f"- value_raw: {ldl_value}")
        print(f"- ref_low: {ldl_low}")
        print(f"- ref_high: {ldl_high}")
        print(f"- abnormal: {ldl_abnormal}")
    else:
        print("LDL check: not found")

    if debug.get("range_parse_examples"):
        print(f"Range parse examples: {len(debug.get('range_parse_examples', []))}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
