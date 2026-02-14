from __future__ import annotations

from typing import Any, Dict, List, Tuple


def _norm(s: str) -> str:
    return " ".join((s or "").strip().lower().replace("_", " ").split())


def _get_by_tokens(abns: List[Dict[str, Any]], *tokens: str) -> List[Dict[str, Any]]:
    """
    Return abnormalities whose test name contains ALL tokens (case-insensitive).
    """
    toks = [_norm(t) for t in tokens if t and t.strip()]
    out: List[Dict[str, Any]] = []
    for a in abns or []:
        name = _norm(a.get("test", ""))
        if name and all(t in name for t in toks):
            out.append(a)
    return out


def build_patterns(abns: List[Dict[str, Any]], context: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Deterministic pattern builder.
    IMPORTANT: Only uses already-detected abnormalities, no guessing.
    """
    abns = abns or []
    patterns: List[Dict[str, Any]] = []

    def add_pattern(
        title: str,
        summary: str,
        likely_conditions: List[str],
        red_flags: List[str],
        next_investigations: List[Dict[str, str]],
        addresses: List[str],
    ):
        if not addresses:
            return
        patterns.append(
            {
                "title": title,
                "summary": summary,
                "likely_conditions": likely_conditions,
                "red_flags": red_flags,
                "next_investigations": next_investigations,
                "addresses": addresses,
            }
        )

    # --- Metabolic: diabetes / hyperglycemia (HbA1c / glucose)
    hba1c = _get_by_tokens(abns, "hba1c")
    glucose_serum = _get_by_tokens(abns, "glucose")  # serum/plasma
    if hba1c or glucose_serum:
        addresses = sorted({a.get("test") for a in (hba1c + glucose_serum) if a.get("test")})
        add_pattern(
            title="Metabolic pattern: Hyperglycemia / diabetes control",
            summary="Glucose and/or HbA1c are abnormal; interpret in clinical context and assess chronicity.",
            likely_conditions=[
                "Diabetes mellitus (poor control if HbA1c elevated)",
                "Stress hyperglycemia (if acute illness)",
                "Medication-related hyperglycemia (e.g., steroids)",
            ],
            red_flags=[
                "Very high glucose with dehydration or altered mental status",
                "Ketosis or acidosis symptoms",
            ],
            next_investigations=[
                {"test": "Repeat fasting glucose", "why": "Confirm abnormality", "what_it_helps": "Confirms persistent hyperglycemia"},
                {"test": "HbA1c (if not already done)", "why": "Assess longer-term control", "what_it_helps": "Chronicity / control"},
                {"test": "Urine ketones (if symptomatic)", "why": "Assess ketoacidosis risk", "what_it_helps": "Detect ketosis"},
            ],
            addresses=addresses,
        )

    # --- Urine: proteinuria (dipstick protein)
    urine_protein = [a for a in abns if _norm(a.get("panel", "")) == "urine" and "protein" in _norm(a.get("test", ""))]
    if urine_protein:
        addresses = sorted({a.get("test") for a in urine_protein if a.get("test")})
        add_pattern(
            title="Renal pattern: Proteinuria",
            summary="Urine protein is abnormal; correlate with renal function and urine microscopy.",
            likely_conditions=[
                "Chronic kidney disease or acute kidney injury (if kidney function markers abnormal)",
                "Glomerular disease (if proteinuria is prominent)",
                "Transient proteinuria (fever/exercise) or medication-related effects",
            ],
            red_flags=[
                "Rapidly rising creatinine or oliguria",
                "Severe electrolyte disturbance",
                "Hematuria with casts or systemic symptoms",
            ],
            next_investigations=[
                {"test": "Urine ACR/PCR", "why": "Quantify proteinuria", "what_it_helps": "Severity / monitoring"},
                {"test": "Urine microscopy", "why": "Look for hematuria/casts", "what_it_helps": "Glomerular vs non-glomerular"},
                {"test": "Renal function (creatinine/eGFR trend)", "why": "Assess trajectory", "what_it_helps": "AKI vs CKD"},
            ],
            addresses=addresses,
        )

    # --- LFT: cholestatic (ALP/GGT) and hepatocellular (AST/ALT)
    alp = _get_by_tokens(abns, "alkaline", "phosphatase")
    ggt = _get_by_tokens(abns, "ggt")
    ast = _get_by_tokens(abns, "sgot") or _get_by_tokens(abns, "ast")
    alt = _get_by_tokens(abns, "sgpt") or _get_by_tokens(abns, "alt")

    if alp or ggt:
        addresses = sorted({a.get("test") for a in (alp + ggt) if a.get("test")})
        add_pattern(
            title="LFT pattern: Cholestatic predominance",
            summary="ALP and/or GGT are elevated, suggesting a cholestatic pattern.",
            likely_conditions=[
                "Biliary obstruction (stones/stricture/mass)",
                "Drug-induced cholestasis",
                "Infiltrative or autoimmune cholestatic disease",
            ],
            red_flags=[
                "Fever + right upper quadrant pain + jaundice",
                "Rapidly rising bilirubin",
            ],
            next_investigations=[
                {"test": "Repeat LFTs + bilirubin", "why": "Confirm trend", "what_it_helps": "Trajectory/severity"},
                {"test": "Right upper quadrant ultrasound", "why": "Assess biliary dilation/obstruction", "what_it_helps": "Obstruction vs medical cholestasis"},
            ],
            addresses=addresses,
        )

    if ast or alt:
        addresses = sorted({a.get("test") for a in (ast + alt) if a.get("test")})
        add_pattern(
            title="LFT pattern: Hepatocellular injury",
            summary="AST/ALT are elevated, suggesting hepatocellular pattern.",
            likely_conditions=[
                "Viral hepatitis or medication-related injury",
                "Ischemic or toxic injury (if marked elevation)",
            ],
            red_flags=[
                "Very high transaminases or acute liver failure features",
                "Coagulopathy or encephalopathy",
            ],
            next_investigations=[
                {"test": "Repeat LFTs + INR", "why": "Assess severity and synthetic function", "what_it_helps": "Risk stratification"},
                {"test": "Hepatitis serologies (as indicated)", "why": "Evaluate infectious causes", "what_it_helps": "Etiology"},
            ],
            addresses=addresses,
        )

    # --- Lipid: atherogenic dyslipidemia (TG/VLDL/ratio/LDL/HDL)
    tg = _get_by_tokens(abns, "triglycerides")
    vldl = _get_by_tokens(abns, "vldl")
    chol_hdl_ratio = _get_by_tokens(abns, "chol", "hdl", "ratio")
    ldl = _get_by_tokens(abns, "ldl")
    hdl = _get_by_tokens(abns, "hdl")
    lipid_hits = tg + vldl + chol_hdl_ratio + ldl + hdl
    if lipid_hits:
        addresses = sorted({a.get("test") for a in lipid_hits if a.get("test")})
        add_pattern(
            title="Lipid pattern: Atherogenic dyslipidemia",
            summary="One or more lipid parameters are abnormal; correlate with cardiovascular risk.",
            likely_conditions=[
                "Dietary/metabolic dyslipidemia",
                "Diabetes-associated dyslipidemia",
                "Secondary causes (alcohol, hypothyroidism, meds)",
            ],
            red_flags=[
                "Very high triglycerides with pancreatitis symptoms",
            ],
            next_investigations=[
                {"test": "Repeat fasting lipid profile", "why": "Confirm and trend", "what_it_helps": "Accuracy and monitoring"},
                {"test": "TSH (if not available)", "why": "Secondary cause screen", "what_it_helps": "Rule out hypothyroidism"},
            ],
            addresses=addresses,
        )

    # --- Nutritional: Vitamin B12 (if present as abnormal)
    b12 = _get_by_tokens(abns, "b12") or _get_by_tokens(abns, "vitamin", "b12")
    if b12:
        addresses = sorted({a.get("test") for a in b12 if a.get("test")})
        add_pattern(
            title="Nutritional pattern: Vitamin B12 abnormality",
            summary="Vitamin B12 is abnormal; interpret with anemia/neuropathy symptoms and CBC indices.",
            likely_conditions=[
                "Dietary deficiency or malabsorption",
                "Medication-related (e.g., metformin) or pernicious anemia (if consistent)",
            ],
            red_flags=[
                "Progressive neuropathy, gait issues, cognitive changes",
            ],
            next_investigations=[
                {"test": "CBC + MCV", "why": "Assess macrocytosis/anemia", "what_it_helps": "Correlate hematologic effect"},
                {"test": "MMA / homocysteine (if needed)", "why": "Confirm functional deficiency", "what_it_helps": "Diagnostic clarification"},
            ],
            addresses=addresses,
        )

    return patterns


def coverage_gate(abns: List[Dict[str, Any]], patterns: List[Dict[str, Any]]) -> Tuple[bool, List[str]]:
    """
    Verify every abnormality is addressed by at least one pattern.
    """
    abns = abns or []
    patterns = patterns or []
    all_tests = [a.get("test") for a in abns if a.get("test")]
    addressed = set()
    for p in patterns:
        for t in p.get("addresses", []) or []:
            addressed.add(t)

    missing = [t for t in all_tests if t not in addressed]
    return (len(missing) == 0), missing
