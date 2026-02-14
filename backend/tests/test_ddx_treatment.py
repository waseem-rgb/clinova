# backend/tests/test_ddx_treatment.py
"""
Tests for DDx and Treatment Advisor features.
- Schema validation
- Garbage pattern detection
- Response structure validation
"""
from __future__ import annotations

import re
from typing import Any, Dict, List

import pytest


# =============================================================================
# GARBAGE PATTERNS - Response should NOT contain these
# =============================================================================

BANNED_PATTERNS = [
    r"\bFurther reading\b",
    r"\bSee also\b",
    r"\bSee chapter\b",
    r"\bSee p\.\s*\d+",
    r"\bChap\.\s*\d+",
    r"\bIndex\b",
    r"\b\d{3,4}[tf]\b",  # Page markers like "3412t", "2786f"
    r"\b\d{3,4}–\d{3,4}\b",  # Page ranges
    r"\bincidence of\s*,",  # Index artifacts
    r"^\s*\d+\s*$",  # Page numbers only
    r"\bCopyright\b",
    r"\bISBN\b",
]

BANNED_REGEX = re.compile("|".join(BANNED_PATTERNS), re.IGNORECASE | re.MULTILINE)


def contains_garbage(text: str) -> bool:
    """Check if text contains banned garbage patterns."""
    if not text:
        return False
    return bool(BANNED_REGEX.search(text))


def find_garbage_in_response(response: Dict[str, Any]) -> List[str]:
    """Find all garbage patterns in a response dict."""
    found = []
    
    def check_value(value: Any, path: str = ""):
        if isinstance(value, str):
            if contains_garbage(value):
                found.append(f"{path}: {value[:100]}...")
        elif isinstance(value, list):
            for i, item in enumerate(value):
                check_value(item, f"{path}[{i}]")
        elif isinstance(value, dict):
            for k, v in value.items():
                check_value(v, f"{path}.{k}" if path else k)
    
    check_value(response)
    return found


# =============================================================================
# DDX SCHEMA TESTS
# =============================================================================

def validate_ddx_response(response: Dict[str, Any]) -> List[str]:
    """Validate DDx response matches expected schema."""
    errors = []
    
    # Required top-level keys
    required_keys = [
        "input_summary",
        "must_not_miss",
        "ranked_ddx",
        "system_wise",
        "rapid_algorithm",
        "suggested_investigations",
        "red_flags",
        "evidence",
        "coverage_gate",
    ]
    
    for key in required_keys:
        if key not in response:
            errors.append(f"Missing required key: {key}")
    
    # Validate must_not_miss structure
    for i, item in enumerate(response.get("must_not_miss") or []):
        if not isinstance(item, dict):
            errors.append(f"must_not_miss[{i}] should be dict")
            continue
        if "diagnosis" not in item:
            errors.append(f"must_not_miss[{i}] missing 'diagnosis'")
        if not isinstance(item.get("key_clues"), list):
            errors.append(f"must_not_miss[{i}] 'key_clues' should be list")
        if not isinstance(item.get("immediate_actions"), list):
            errors.append(f"must_not_miss[{i}] 'immediate_actions' should be list")
    
    # Validate ranked_ddx structure
    for i, item in enumerate(response.get("ranked_ddx") or []):
        if not isinstance(item, dict):
            errors.append(f"ranked_ddx[{i}] should be dict")
            continue
        if "diagnosis" not in item:
            errors.append(f"ranked_ddx[{i}] missing 'diagnosis'")
        if "likelihood" not in item:
            errors.append(f"ranked_ddx[{i}] missing 'likelihood'")
    
    # Validate rapid_algorithm structure
    algorithm = response.get("rapid_algorithm") or {}
    for step in ["step_1", "step_2", "step_3"]:
        if step not in algorithm:
            errors.append(f"rapid_algorithm missing '{step}'")
        elif not isinstance(algorithm[step], list):
            errors.append(f"rapid_algorithm.{step} should be list")
    
    # Validate coverage_gate
    coverage = response.get("coverage_gate") or {}
    if "passed" not in coverage:
        errors.append("coverage_gate missing 'passed'")
    
    return errors


# =============================================================================
# TREATMENT SCHEMA TESTS
# =============================================================================

def validate_treatment_response(response: Dict[str, Any]) -> List[str]:
    """Validate Treatment response matches expected schema."""
    errors = []
    
    # Required top-level keys
    required_keys = [
        "topic",
        "summary_plan",
        "first_line_regimens",
        "second_line_regimens",
        "supportive_care",
        "contraindications_and_cautions",
        "monitoring",
        "red_flags_urgent_referral",
        "follow_up",
        "brands_india",
        "evidence",
    ]
    
    for key in required_keys:
        if key not in response:
            errors.append(f"Missing required key: {key}")
    
    # Validate regimen structure
    for label, regimens_key in [("first_line", "first_line_regimens"), ("second_line", "second_line_regimens")]:
        for i, regimen in enumerate(response.get(regimens_key) or []):
            if not isinstance(regimen, dict):
                errors.append(f"{regimens_key}[{i}] should be dict")
                continue
            if "label" not in regimen:
                errors.append(f"{regimens_key}[{i}] missing 'label'")
            if "drugs" not in regimen:
                errors.append(f"{regimens_key}[{i}] missing 'drugs'")
            else:
                for j, drug in enumerate(regimen.get("drugs") or []):
                    if not isinstance(drug, dict):
                        errors.append(f"{regimens_key}[{i}].drugs[{j}] should be dict")
                        continue
                    if "generic" not in drug:
                        errors.append(f"{regimens_key}[{i}].drugs[{j}] missing 'generic'")
    
    # Validate brands_india structure
    for i, brand in enumerate(response.get("brands_india") or []):
        if not isinstance(brand, dict):
            errors.append(f"brands_india[{i}] should be dict")
            continue
        if "generic" not in brand:
            errors.append(f"brands_india[{i}] missing 'generic'")
        if "source" not in brand:
            errors.append(f"brands_india[{i}] missing 'source'")
    
    # Validate evidence structure
    evidence = response.get("evidence") or {}
    if "chunks" not in evidence:
        errors.append("evidence missing 'chunks'")
    if "coverage" not in evidence:
        errors.append("evidence missing 'coverage'")
    
    return errors


# =============================================================================
# PYTEST TEST CASES
# =============================================================================

class TestGarbagePatterns:
    """Test garbage pattern detection."""
    
    def test_detects_further_reading(self):
        assert contains_garbage("Further reading: see chapter 10")
    
    def test_detects_see_also(self):
        assert contains_garbage("See also: related topics")
    
    def test_detects_page_markers(self):
        assert contains_garbage("hypercalcemia, 3412t, 2786f")
    
    def test_detects_page_ranges(self):
        assert contains_garbage("discussed on pages 123–456")
    
    def test_detects_index_artifacts(self):
        assert contains_garbage("incidence of, complications")
    
    def test_clean_clinical_text(self):
        assert not contains_garbage("Patient presents with fever and cough for 3 days.")
    
    def test_clean_treatment_text(self):
        assert not contains_garbage("First-line treatment: Amoxicillin 500mg PO TDS for 7 days")


class TestDDxSchema:
    """Test DDx response schema validation."""
    
    def test_valid_response(self):
        response = {
            "input_summary": {"symptoms": "fever"},
            "must_not_miss": [
                {"diagnosis": "Sepsis", "key_clues": ["fever", "tachycardia"], "immediate_actions": ["blood cultures"]}
            ],
            "ranked_ddx": [
                {"diagnosis": "Pneumonia", "likelihood": "high", "for": [], "against": []}
            ],
            "system_wise": [],
            "rapid_algorithm": {"step_1": [], "step_2": [], "step_3": []},
            "suggested_investigations": {"urgent": [], "soon": [], "routine": []},
            "red_flags": [],
            "evidence": [],
            "coverage_gate": {"passed": True, "missing_evidence_ids": []},
        }
        errors = validate_ddx_response(response)
        assert len(errors) == 0, f"Unexpected errors: {errors}"
    
    def test_missing_required_keys(self):
        response = {"topic": "test"}
        errors = validate_ddx_response(response)
        assert len(errors) > 0
        assert any("input_summary" in e for e in errors)


class TestTreatmentSchema:
    """Test Treatment response schema validation."""
    
    def test_valid_response(self):
        response = {
            "topic": "Community acquired pneumonia",
            "summary_plan": ["Antibiotic therapy"],
            "first_line_regimens": [
                {
                    "label": "Outpatient CAP",
                    "indication_notes": "Mild severity",
                    "drugs": [
                        {"generic": "amoxicillin", "dose": "500mg", "route": "PO", "frequency": "TDS", "duration": "5-7 days"}
                    ]
                }
            ],
            "second_line_regimens": [],
            "supportive_care": [],
            "contraindications_and_cautions": [],
            "monitoring": [],
            "drug_interactions_flags": [],
            "red_flags_urgent_referral": [],
            "follow_up": [],
            "brands_india": [
                {"generic": "amoxicillin", "brand_names": ["Amoxil"], "source": "MIMS"}
            ],
            "evidence": {"chunks": [], "coverage": {"pass": True}},
        }
        errors = validate_treatment_response(response)
        assert len(errors) == 0, f"Unexpected errors: {errors}"
    
    def test_missing_required_keys(self):
        response = {"topic": "test"}
        errors = validate_treatment_response(response)
        assert len(errors) > 0


class TestGarbageInResponse:
    """Test that responses don't contain garbage."""
    
    def test_find_garbage_simple(self):
        response = {
            "diagnosis": "Pneumonia. Further reading: see chapter 5",
            "notes": ["Treatment options, 3412t"]
        }
        found = find_garbage_in_response(response)
        assert len(found) >= 2
    
    def test_clean_response(self):
        response = {
            "diagnosis": "Community acquired pneumonia",
            "treatment": "Amoxicillin 500mg PO TDS for 7 days",
            "monitoring": ["Clinical response at 48-72 hours"]
        }
        found = find_garbage_in_response(response)
        assert len(found) == 0


# =============================================================================
# INTEGRATION TEST HELPERS
# =============================================================================

def run_ddx_validation(response: Dict[str, Any]) -> Dict[str, Any]:
    """Run full DDx response validation."""
    schema_errors = validate_ddx_response(response)
    garbage = find_garbage_in_response(response)
    
    return {
        "valid": len(schema_errors) == 0 and len(garbage) == 0,
        "schema_errors": schema_errors,
        "garbage_found": garbage,
    }


def run_treatment_validation(response: Dict[str, Any]) -> Dict[str, Any]:
    """Run full Treatment response validation."""
    schema_errors = validate_treatment_response(response)
    garbage = find_garbage_in_response(response)
    
    return {
        "valid": len(schema_errors) == 0 and len(garbage) == 0,
        "schema_errors": schema_errors,
        "garbage_found": garbage,
    }


if __name__ == "__main__":
    # Run basic tests
    print("Testing garbage detection...")
    assert contains_garbage("Further reading")
    assert contains_garbage("3412t")
    assert not contains_garbage("Treat with amoxicillin 500mg")
    print("✓ Garbage detection works")
    
    print("\nTesting DDx schema...")
    ddx_response = {
        "input_summary": {},
        "must_not_miss": [],
        "ranked_ddx": [],
        "system_wise": [],
        "rapid_algorithm": {"step_1": [], "step_2": [], "step_3": []},
        "suggested_investigations": {"urgent": [], "soon": [], "routine": []},
        "red_flags": [],
        "evidence": [],
        "coverage_gate": {"passed": True, "missing_evidence_ids": []},
    }
    errors = validate_ddx_response(ddx_response)
    assert len(errors) == 0, f"Errors: {errors}"
    print("✓ DDx schema validation works")
    
    print("\nAll tests passed!")
