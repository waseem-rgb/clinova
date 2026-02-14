# backend/app/lab/infer.py
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Literal
import re


Direction = Literal["H", "L", "POS"]


@dataclass
class ExtractedTest:
    test: str
    panel: str
    value_raw: str
    value_num: Optional[float]
    unit: Optional[str]
    ref_low: Optional[float]
    ref_high: Optional[float]
    ref_range_raw: Optional[str]
    source_page: Optional[int]


@dataclass
class Abnormality:
    test: str
    panel: str
    value_raw: str
    value_num: Optional[float]
    unit: Optional[str]
    ref_low: Optional[float]
    ref_high: Optional[float]
    direction: Direction
    source_page: Optional[int]


# -------------------------------
# Canonical normalisation
# -------------------------------

def _norm_test_name(name: str) -> str:
    n = name.lower().strip()
    n = re.sub(r"\s+", " ", n)

    # Vitamin B12 aliases
    if re.search(r"\b(vitamin\s*b\s*12|vit\s*b12|b12)\b", n):
        return "vitamin b12"

    # HbA1c aliases
    if re.search(r"\b(hba1c|glycosylated hemoglobin)\b", n):
        return "hba1c"

    return n


# -------------------------------
# Qualitative urine rules
# -------------------------------

URINE_POSITIVE_KEYWORDS = {
    "present",
    "+",
    "++",
    "+++",
    "positive",
    "trace",
}


def _is_qualitative_positive(value_raw: str) -> bool:
    if not value_raw:
        return False
    v = value_raw.lower()
    return any(k in v for k in URINE_POSITIVE_KEYWORDS)


# -------------------------------
# Single-bound range parsing
# -------------------------------

_SINGLE_BOUND_RE = re.compile(
    r"(below|less than|<)\s*(\d+(\.\d+)?)|"
    r"(above|greater than|>|>=)\s*(\d+(\.\d+)?)",
    re.I,
)


def _parse_single_bound(ref: str):
    """
    Returns tuple (direction, threshold)
    direction: "upper" means value must be <= threshold to be normal
               "lower" means value must be >= threshold to be normal
    """
    if not ref:
        return None

    m = _SINGLE_BOUND_RE.search(ref)
    if not m:
        return None

    if m.group(1):  # below / <
        return ("upper", float(m.group(2)))
    if m.group(4):  # above / >
        return ("lower", float(m.group(5)))

    return None


# -------------------------------
# Core abnormality inference
# -------------------------------

def infer_abnormalities(extracted_tests: List[ExtractedTest]) -> List[Abnormality]:
    abnormalities: List[Abnormality] = []

    for t in extracted_tests:
        test_norm = _norm_test_name(t.test)

        # -----------------------
        # HbA1c hard rule
        # -----------------------
        if test_norm == "hba1c" and t.value_num is not None:
            if t.value_num >= 6.5:
                abnormalities.append(
                    Abnormality(
                        test=t.test,
                        panel=t.panel,
                        value_raw=t.value_raw,
                        value_num=t.value_num,
                        unit=t.unit,
                        ref_low=t.ref_low,
                        ref_high=t.ref_high,
                        direction="H",
                        source_page=t.source_page,
                    )
                )
            continue

        # -----------------------
        # Qualitative urine tests
        # -----------------------
        if t.panel.lower() == "urine":
            if _is_qualitative_positive(t.value_raw):
                abnormalities.append(
                    Abnormality(
                        test=t.test,
                        panel=t.panel,
                        value_raw=t.value_raw,
                        value_num=None,
                        unit=t.unit,
                        ref_low=t.ref_low,
                        ref_high=t.ref_high,
                        direction="POS",
                        source_page=t.source_page,
                    )
                )
            continue

        # -----------------------
        # Numeric tests
        # -----------------------
        if t.value_num is not None:
            # Full range available
            if t.ref_low is not None and t.ref_high is not None:
                if t.value_num < t.ref_low:
                    abnormalities.append(
                        Abnormality(
                            test=t.test,
                            panel=t.panel,
                            value_raw=t.value_raw,
                            value_num=t.value_num,
                            unit=t.unit,
                            ref_low=t.ref_low,
                            ref_high=t.ref_high,
                            direction="L",
                            source_page=t.source_page,
                        )
                    )
                elif t.value_num > t.ref_high:
                    abnormalities.append(
                        Abnormality(
                            test=t.test,
                            panel=t.panel,
                            value_raw=t.value_raw,
                            value_num=t.value_num,
                            unit=t.unit,
                            ref_low=t.ref_low,
                            ref_high=t.ref_high,
                            direction="H",
                            source_page=t.source_page,
                        )
                    )
                continue

            # Single-bound range
            sb = _parse_single_bound(t.ref_range_raw or "")
            if sb:
                mode, threshold = sb
                if mode == "upper" and t.value_num > threshold:
                    abnormalities.append(
                        Abnormality(
                            test=t.test,
                            panel=t.panel,
                            value_raw=t.value_raw,
                            value_num=t.value_num,
                            unit=t.unit,
                            ref_low=None,
                            ref_high=threshold,
                            direction="H",
                            source_page=t.source_page,
                        )
                    )
                elif mode == "lower" and t.value_num < threshold:
                    abnormalities.append(
                        Abnormality(
                            test=t.test,
                            panel=t.panel,
                            value_raw=t.value_raw,
                            value_num=t.value_num,
                            unit=t.unit,
                            ref_low=threshold,
                            ref_high=None,
                            direction="L",
                            source_page=t.source_page,
                        )
                    )

    return abnormalities
