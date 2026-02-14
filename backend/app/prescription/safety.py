"""
Prescription Safety Checks - High-signal safety alerts only.

Implements deterministic safety checks that are:
- High-signal (clinically significant)
- Not noisy (no alert fatigue)
- Based on established drug interactions and contraindications

The doctor is always the final authority. Alerts are informational.
"""

from __future__ import annotations

import re
import uuid
from typing import Any, Dict, List, Set, Tuple

from .models import RxItem, Patient, SafetyAlert


# ============================================================
# Drug classification data
# ============================================================

# NSAIDs
NSAIDS: Set[str] = {
    "ibuprofen", "diclofenac", "naproxen", "aspirin", "celecoxib", 
    "etoricoxib", "meloxicam", "piroxicam", "indomethacin", "ketorolac",
    "aceclofenac", "ketoprofen", "mefenamic acid", "nimesulide"
}

# Anticoagulants and antiplatelets
ANTICOAGULANTS: Set[str] = {
    "warfarin", "heparin", "enoxaparin", "rivaroxaban", "apixaban", 
    "dabigatran", "edoxaban", "fondaparinux"
}

ANTIPLATELETS: Set[str] = {
    "aspirin", "clopidogrel", "prasugrel", "ticagrelor", "dipyridamole"
}

# ACE Inhibitors
ACE_INHIBITORS: Set[str] = {
    "enalapril", "lisinopril", "ramipril", "captopril", "perindopril",
    "quinapril", "benazepril", "fosinopril", "trandolapril"
}

# ARBs
ARBS: Set[str] = {
    "losartan", "valsartan", "telmisartan", "olmesartan", "irbesartan",
    "candesartan", "azilsartan"
}

# Potassium-sparing diuretics
K_SPARING_DIURETICS: Set[str] = {
    "spironolactone", "eplerenone", "amiloride", "triamterene"
}

# QT prolonging drugs (high-risk ones)
QT_PROLONGING: Set[str] = {
    "amiodarone", "sotalol", "dronedarone", "dofetilide",
    "haloperidol", "droperidol", "thioridazine",
    "erythromycin", "clarithromycin", "moxifloxacin", "levofloxacin",
    "ondansetron", "methadone", "domperidone",
    "citalopram", "escitalopram", "fluconazole"
}

# Sedatives/CNS depressants
CNS_DEPRESSANTS: Set[str] = {
    "diazepam", "lorazepam", "alprazolam", "clonazepam", "midazolam",
    "zolpidem", "zopiclone", "eszopiclone",
    "tramadol", "codeine", "morphine", "oxycodone", "fentanyl",
    "gabapentin", "pregabalin",
    "promethazine", "diphenhydramine", "hydroxyzine"
}

# Serotonergic drugs (for serotonin syndrome risk)
SEROTONERGIC: Set[str] = {
    "fluoxetine", "sertraline", "paroxetine", "citalopram", "escitalopram",
    "venlafaxine", "duloxetine", "desvenlafaxine",
    "tramadol", "fentanyl", "meperidine",
    "trazodone", "mirtazapine",
    "linezolid", "methylene blue"
}

# MAO Inhibitors
MAOIS: Set[str] = {
    "phenelzine", "tranylcypromine", "isocarboxazid", "selegiline",
    "rasagiline", "linezolid"
}

# Metformin (for lactic acidosis warnings)
METFORMIN_RELATED: Set[str] = {"metformin"}

# Contrast-interacting drugs
NEPHROTOXIC: Set[str] = {
    "gentamicin", "tobramycin", "amikacin", "vancomycin",
    "amphotericin", "cidofovir", "foscarnet",
    "metformin", "nsaids"
}


def _normalize_drug(name: str) -> str:
    """Normalize drug name for matching"""
    name = (name or "").strip().lower()
    # Remove common suffixes
    name = re.sub(r"\s*(tablet|capsule|syrup|injection|drops|cream|gel|ointment)s?$", "", name)
    # Remove strength
    name = re.sub(r"\s*\d+(\.\d+)?\s*(mg|g|mcg|ml|iu|%)\s*$", "", name)
    return name.strip()


def _drug_in_class(drug: str, drug_class: Set[str]) -> bool:
    """Check if a drug belongs to a class"""
    drug_norm = _normalize_drug(drug)
    for cls_drug in drug_class:
        if cls_drug in drug_norm or drug_norm in cls_drug:
            return True
    return False


def _get_drugs_in_class(drugs: List[str], drug_class: Set[str]) -> List[str]:
    """Get all drugs from a list that are in a class"""
    return [d for d in drugs if _drug_in_class(d, drug_class)]


# ============================================================
# Safety check functions
# ============================================================

def check_duplicates(rx_items: List[RxItem]) -> List[SafetyAlert]:
    """Check for duplicate generic drugs"""
    alerts = []
    seen_generics: Dict[str, int] = {}
    
    for item in rx_items:
        generic = _normalize_drug(item.generic)
        if generic in seen_generics:
            alerts.append(SafetyAlert(
                id=str(uuid.uuid4())[:8],
                type="duplicate",
                severity="moderate",
                message=f"Duplicate drug: {item.generic} prescribed more than once",
                related_drugs=[item.generic],
                rule_id="DUP001"
            ))
        else:
            seen_generics[generic] = 1
    
    return alerts


def check_nsaid_anticoagulant(rx_items: List[RxItem]) -> List[SafetyAlert]:
    """Check for NSAID + Anticoagulant combination - HIGH RISK"""
    alerts = []
    drugs = [item.generic for item in rx_items]
    
    nsaids_found = _get_drugs_in_class(drugs, NSAIDS)
    anticoag_found = _get_drugs_in_class(drugs, ANTICOAGULANTS)
    
    if nsaids_found and anticoag_found:
        alerts.append(SafetyAlert(
            id=str(uuid.uuid4())[:8],
            type="interaction",
            severity="high",
            message="NSAID + Anticoagulant: Significantly increased bleeding risk. Consider gastroprotection if combination unavoidable.",
            related_drugs=nsaids_found + anticoag_found,
            rule_id="INT001"
        ))
    
    return alerts


def check_nsaid_antiplatelet(rx_items: List[RxItem]) -> List[SafetyAlert]:
    """Check for multiple NSAIDs/Antiplatelets - bleeding risk"""
    alerts = []
    drugs = [item.generic for item in rx_items]
    
    nsaids_found = _get_drugs_in_class(drugs, NSAIDS)
    antiplatelet_found = _get_drugs_in_class(drugs, ANTIPLATELETS)
    
    # Don't double-alert for aspirin which is in both
    combined = list(set(nsaids_found + antiplatelet_found))
    
    if len(combined) >= 2:
        alerts.append(SafetyAlert(
            id=str(uuid.uuid4())[:8],
            type="interaction",
            severity="high",
            message="Multiple NSAIDs/Antiplatelets: Increased GI bleeding risk. Consider PPI for gastroprotection.",
            related_drugs=combined,
            rule_id="INT002"
        ))
    
    return alerts


def check_ace_arb_k_sparing(rx_items: List[RxItem]) -> List[SafetyAlert]:
    """Check for ACE/ARB + K-sparing diuretic - hyperkalemia risk"""
    alerts = []
    drugs = [item.generic for item in rx_items]
    
    ace_found = _get_drugs_in_class(drugs, ACE_INHIBITORS)
    arb_found = _get_drugs_in_class(drugs, ARBS)
    k_sparing_found = _get_drugs_in_class(drugs, K_SPARING_DIURETICS)
    
    raas_blockers = ace_found + arb_found
    
    if raas_blockers and k_sparing_found:
        alerts.append(SafetyAlert(
            id=str(uuid.uuid4())[:8],
            type="interaction",
            severity="high",
            message="ACE-I/ARB + K-sparing diuretic: High risk of hyperkalemia. Monitor potassium levels.",
            related_drugs=raas_blockers + k_sparing_found,
            rule_id="INT003"
        ))
    
    return alerts


def check_dual_raas_blockade(rx_items: List[RxItem]) -> List[SafetyAlert]:
    """Check for ACE + ARB dual blockade - generally avoid"""
    alerts = []
    drugs = [item.generic for item in rx_items]
    
    ace_found = _get_drugs_in_class(drugs, ACE_INHIBITORS)
    arb_found = _get_drugs_in_class(drugs, ARBS)
    
    if ace_found and arb_found:
        alerts.append(SafetyAlert(
            id=str(uuid.uuid4())[:8],
            type="interaction",
            severity="high",
            message="Dual RAAS blockade (ACE-I + ARB): Increased risk of hyperkalemia, hypotension, and renal dysfunction. Generally not recommended.",
            related_drugs=ace_found + arb_found,
            rule_id="INT004"
        ))
    
    return alerts


def check_qt_prolongation(rx_items: List[RxItem]) -> List[SafetyAlert]:
    """Check for multiple QT-prolonging drugs"""
    alerts = []
    drugs = [item.generic for item in rx_items]
    
    qt_drugs = _get_drugs_in_class(drugs, QT_PROLONGING)
    
    if len(qt_drugs) >= 2:
        alerts.append(SafetyAlert(
            id=str(uuid.uuid4())[:8],
            type="interaction",
            severity="high",
            message="Multiple QT-prolonging drugs: Increased risk of Torsades de Pointes. Consider ECG monitoring.",
            related_drugs=qt_drugs,
            rule_id="INT005"
        ))
    
    return alerts


def check_cns_depression(rx_items: List[RxItem]) -> List[SafetyAlert]:
    """Check for multiple CNS depressants"""
    alerts = []
    drugs = [item.generic for item in rx_items]
    
    cns_drugs = _get_drugs_in_class(drugs, CNS_DEPRESSANTS)
    
    if len(cns_drugs) >= 2:
        alerts.append(SafetyAlert(
            id=str(uuid.uuid4())[:8],
            type="interaction",
            severity="moderate",
            message="Multiple CNS depressants: Increased sedation and respiratory depression risk. Advise patient about drowsiness.",
            related_drugs=cns_drugs,
            rule_id="INT006"
        ))
    
    return alerts


def check_serotonin_syndrome(rx_items: List[RxItem]) -> List[SafetyAlert]:
    """Check for serotonin syndrome risk"""
    alerts = []
    drugs = [item.generic for item in rx_items]
    
    serotonergic_found = _get_drugs_in_class(drugs, SEROTONERGIC)
    maoi_found = _get_drugs_in_class(drugs, MAOIS)
    
    # SSRI + MAOI is very high risk
    if serotonergic_found and maoi_found:
        alerts.append(SafetyAlert(
            id=str(uuid.uuid4())[:8],
            type="interaction",
            severity="high",
            message="Serotonergic drug + MAOI: High risk of serotonin syndrome. Generally contraindicated.",
            related_drugs=serotonergic_found + maoi_found,
            rule_id="INT007"
        ))
    elif len(serotonergic_found) >= 2:
        alerts.append(SafetyAlert(
            id=str(uuid.uuid4())[:8],
            type="interaction",
            severity="moderate",
            message="Multiple serotonergic drugs: Monitor for serotonin syndrome symptoms.",
            related_drugs=serotonergic_found,
            rule_id="INT008"
        ))
    
    return alerts


def check_renal_function(rx_items: List[RxItem], patient: Patient) -> List[SafetyAlert]:
    """Check for drugs that need renal function monitoring"""
    alerts = []
    drugs = [item.generic for item in rx_items]
    
    nephrotoxic_found = _get_drugs_in_class(drugs, NEPHROTOXIC)
    metformin_found = _get_drugs_in_class(drugs, METFORMIN_RELATED)
    
    # For elderly patients (>65) with nephrotoxic drugs
    if patient.age > 65 and (nephrotoxic_found or metformin_found):
        alerts.append(SafetyAlert(
            id=str(uuid.uuid4())[:8],
            type="patient_factor",
            severity="moderate",
            message=f"Patient age {patient.age}: Consider renal function before prescribing nephrotoxic drugs.",
            related_drugs=nephrotoxic_found + metformin_found,
            rule_id="PAT001"
        ))
    
    return alerts


# ============================================================
# Main safety check function
# ============================================================

def run_safety_checks(
    rx_items: List[RxItem],
    patient: Patient,
    existing_alerts: List[SafetyAlert] = None
) -> Tuple[List[SafetyAlert], str]:
    """
    Run all safety checks on a prescription.
    
    Args:
        rx_items: List of medications
        patient: Patient information
        existing_alerts: Previously generated alerts (to avoid duplicates)
    
    Returns:
        Tuple of (alerts, overall_risk_level)
    """
    all_alerts: List[SafetyAlert] = []
    existing_ids = {a.rule_id for a in (existing_alerts or [])}
    
    # Run all checks
    check_functions = [
        check_duplicates,
        check_nsaid_anticoagulant,
        check_nsaid_antiplatelet,
        check_ace_arb_k_sparing,
        check_dual_raas_blockade,
        check_qt_prolongation,
        check_cns_depression,
        check_serotonin_syndrome,
    ]
    
    for check_fn in check_functions:
        try:
            alerts = check_fn(rx_items)
            # Filter out already existing alerts
            for alert in alerts:
                if alert.rule_id not in existing_ids:
                    all_alerts.append(alert)
                    existing_ids.add(alert.rule_id)
        except Exception:
            # Don't fail the whole check if one fails
            continue
    
    # Patient-specific checks
    try:
        patient_alerts = check_renal_function(rx_items, patient)
        for alert in patient_alerts:
            if alert.rule_id not in existing_ids:
                all_alerts.append(alert)
                existing_ids.add(alert.rule_id)
    except Exception:
        pass
    
    # Determine overall risk level
    has_high = any(a.severity == "high" for a in all_alerts)
    has_moderate = any(a.severity == "moderate" for a in all_alerts)
    
    if has_high:
        overall_risk = "high"
    elif has_moderate:
        overall_risk = "moderate"
    else:
        overall_risk = "low"
    
    return all_alerts, overall_risk
