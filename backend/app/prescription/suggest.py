"""
Prescription Suggestions - Inline typeahead suggestions for prescription fields.

Provides fast, relevant suggestions for:
- Drug names (generic + Indian brands)
- Frequencies (OD, BD, TDS, etc.)
- Durations (5 days, 1 week, etc.)
- Timings (before food, after food, etc.)
- Instructions
- Diagnoses
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

# Data paths
DATA_DIR = Path(__file__).resolve().parents[1] / "data"
BRANDS_PATH = DATA_DIR / "india_brands.json"
DRUGS_INDEX_PATH = DATA_DIR / "drugs_alias_index.json"


def _load_json(path: Path) -> Any:
    """Load JSON file if exists"""
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _normalize(s: str) -> str:
    """Normalize string for matching"""
    return re.sub(r"\s+", " ", (s or "").strip().lower())


# ============================================================
# Static suggestion data
# ============================================================

FREQUENCY_SUGGESTIONS = [
    {"display": "OD - Once daily", "value": "OD", "full": "Once daily"},
    {"display": "BD - Twice daily", "value": "BD", "full": "Twice daily"},
    {"display": "TDS - Thrice daily", "value": "TDS", "full": "Thrice daily"},
    {"display": "QID - Four times daily", "value": "QID", "full": "Four times daily"},
    {"display": "HS - At bedtime", "value": "HS", "full": "At bedtime"},
    {"display": "SOS - As needed", "value": "SOS", "full": "As needed / PRN"},
    {"display": "STAT - Immediately", "value": "STAT", "full": "Immediately"},
    {"display": "Q4H - Every 4 hours", "value": "Q4H", "full": "Every 4 hours"},
    {"display": "Q6H - Every 6 hours", "value": "Q6H", "full": "Every 6 hours"},
    {"display": "Q8H - Every 8 hours", "value": "Q8H", "full": "Every 8 hours"},
    {"display": "Q12H - Every 12 hours", "value": "Q12H", "full": "Every 12 hours"},
    {"display": "Weekly - Once a week", "value": "WEEKLY", "full": "Once a week"},
    {"display": "Alternate days", "value": "ALTERNATE DAYS", "full": "Every other day"},
    {"display": "Before meals (AC)", "value": "BEFORE MEALS", "full": "Before meals"},
    {"display": "After meals (PC)", "value": "AFTER MEALS", "full": "After meals"},
]

DURATION_SUGGESTIONS = [
    {"display": "3 days", "value": "3 days"},
    {"display": "5 days", "value": "5 days"},
    {"display": "7 days", "value": "7 days"},
    {"display": "1 week", "value": "1 week"},
    {"display": "10 days", "value": "10 days"},
    {"display": "2 weeks", "value": "2 weeks"},
    {"display": "3 weeks", "value": "3 weeks"},
    {"display": "1 month", "value": "1 month"},
    {"display": "2 months", "value": "2 months"},
    {"display": "3 months", "value": "3 months"},
    {"display": "6 months", "value": "6 months"},
    {"display": "Long term", "value": "Long term"},
    {"display": "Until review", "value": "Until review"},
    {"display": "As needed", "value": "As needed"},
]

TIMING_SUGGESTIONS = [
    {"display": "Before food", "value": "Before food"},
    {"display": "After food", "value": "After food"},
    {"display": "With food", "value": "With food"},
    {"display": "Empty stomach", "value": "Empty stomach"},
    {"display": "At bedtime", "value": "At bedtime"},
    {"display": "Morning", "value": "Morning"},
    {"display": "Evening", "value": "Evening"},
    {"display": "Before breakfast", "value": "Before breakfast"},
    {"display": "After breakfast", "value": "After breakfast"},
    {"display": "Before lunch", "value": "Before lunch"},
    {"display": "After lunch", "value": "After lunch"},
    {"display": "Before dinner", "value": "Before dinner"},
    {"display": "After dinner", "value": "After dinner"},
]

ROUTE_SUGGESTIONS = [
    {"display": "Oral", "value": "Oral"},
    {"display": "IV (Intravenous)", "value": "IV"},
    {"display": "IM (Intramuscular)", "value": "IM"},
    {"display": "SC (Subcutaneous)", "value": "SC"},
    {"display": "Topical", "value": "Topical"},
    {"display": "Inhalation", "value": "Inhalation"},
    {"display": "Sublingual", "value": "Sublingual"},
    {"display": "Rectal", "value": "Rectal"},
    {"display": "Nasal", "value": "Nasal"},
    {"display": "Ophthalmic (Eye)", "value": "Ophthalmic"},
    {"display": "Otic (Ear)", "value": "Otic"},
]

FORM_SUGGESTIONS = [
    {"display": "Tab (Tablet)", "value": "Tab"},
    {"display": "Cap (Capsule)", "value": "Cap"},
    {"display": "Syr (Syrup)", "value": "Syr"},
    {"display": "Inj (Injection)", "value": "Inj"},
    {"display": "Drops", "value": "Drops"},
    {"display": "Cream", "value": "Cream"},
    {"display": "Ointment", "value": "Ointment"},
    {"display": "Gel", "value": "Gel"},
    {"display": "Suspension", "value": "Suspension"},
    {"display": "Powder", "value": "Powder"},
    {"display": "Inhaler", "value": "Inhaler"},
    {"display": "Patch", "value": "Patch"},
    {"display": "Lotion", "value": "Lotion"},
    {"display": "Solution", "value": "Solution"},
]

INSTRUCTION_SUGGESTIONS = [
    {"display": "Take with plenty of water", "value": "Take with plenty of water"},
    {"display": "Do not crush or chew", "value": "Do not crush or chew"},
    {"display": "Avoid alcohol", "value": "Avoid alcohol"},
    {"display": "Avoid driving", "value": "Avoid driving"},
    {"display": "May cause drowsiness", "value": "May cause drowsiness"},
    {"display": "Keep refrigerated", "value": "Keep refrigerated"},
    {"display": "Shake well before use", "value": "Shake well before use"},
    {"display": "Apply thin layer", "value": "Apply thin layer"},
    {"display": "Complete the full course", "value": "Complete the full course"},
    {"display": "Monitor blood sugar", "value": "Monitor blood sugar"},
    {"display": "Monitor blood pressure", "value": "Monitor blood pressure"},
    {"display": "Take on empty stomach", "value": "Take on empty stomach"},
    {"display": "Take 30 mins before food", "value": "Take 30 mins before food"},
    {"display": "Avoid sun exposure", "value": "Avoid sun exposure"},
]

# Common diagnoses for quick entry
DIAGNOSIS_SUGGESTIONS = [
    {"display": "URTI - Upper Respiratory Tract Infection", "value": "Upper Respiratory Tract Infection"},
    {"display": "AGE - Acute Gastroenteritis", "value": "Acute Gastroenteritis"},
    {"display": "UTI - Urinary Tract Infection", "value": "Urinary Tract Infection"},
    {"display": "Viral Fever", "value": "Viral Fever"},
    {"display": "Hypertension", "value": "Hypertension"},
    {"display": "Type 2 Diabetes Mellitus", "value": "Type 2 Diabetes Mellitus"},
    {"display": "Hypothyroidism", "value": "Hypothyroidism"},
    {"display": "Hyperthyroidism", "value": "Hyperthyroidism"},
    {"display": "Bronchial Asthma", "value": "Bronchial Asthma"},
    {"display": "COPD - Chronic Obstructive Pulmonary Disease", "value": "COPD"},
    {"display": "Pneumonia", "value": "Pneumonia"},
    {"display": "Migraine", "value": "Migraine"},
    {"display": "Tension Headache", "value": "Tension Headache"},
    {"display": "Acid Peptic Disease", "value": "Acid Peptic Disease"},
    {"display": "GERD - Gastroesophageal Reflux Disease", "value": "GERD"},
    {"display": "Allergic Rhinitis", "value": "Allergic Rhinitis"},
    {"display": "Skin Allergy", "value": "Skin Allergy"},
    {"display": "Eczema", "value": "Eczema"},
    {"display": "Psoriasis", "value": "Psoriasis"},
    {"display": "Fungal Infection", "value": "Fungal Infection"},
    {"display": "Anemia", "value": "Anemia"},
    {"display": "Vitamin D Deficiency", "value": "Vitamin D Deficiency"},
    {"display": "Osteoarthritis", "value": "Osteoarthritis"},
    {"display": "Low Back Pain", "value": "Low Back Pain"},
    {"display": "Cervical Spondylosis", "value": "Cervical Spondylosis"},
    {"display": "Anxiety Disorder", "value": "Anxiety Disorder"},
    {"display": "Depression", "value": "Depression"},
]


# ============================================================
# Drug suggestions with Indian brands
# ============================================================

# Common drugs with their brands (subset for fast inline suggestions)
COMMON_DRUGS = [
    {"generic": "Paracetamol", "brands": ["Crocin", "Dolo", "Calpol", "Metacin"], "strengths": ["500mg", "650mg", "1000mg"]},
    {"generic": "Ibuprofen", "brands": ["Brufen", "Combiflam", "Ibugesic"], "strengths": ["200mg", "400mg", "600mg"]},
    {"generic": "Amoxicillin", "brands": ["Mox", "Amoxil", "Novamox"], "strengths": ["250mg", "500mg"]},
    {"generic": "Azithromycin", "brands": ["Zithromax", "Azee", "Azithral"], "strengths": ["250mg", "500mg"]},
    {"generic": "Metformin", "brands": ["Glycomet", "Glucophage", "Obimet"], "strengths": ["500mg", "850mg", "1000mg"]},
    {"generic": "Atorvastatin", "brands": ["Atorva", "Lipitor", "Storvas"], "strengths": ["10mg", "20mg", "40mg"]},
    {"generic": "Amlodipine", "brands": ["Amlopress", "Norvasc", "Amlip"], "strengths": ["2.5mg", "5mg", "10mg"]},
    {"generic": "Omeprazole", "brands": ["Omez", "Prilosec", "Ocid"], "strengths": ["20mg", "40mg"]},
    {"generic": "Pantoprazole", "brands": ["Pan", "Pantocid", "Pantop"], "strengths": ["20mg", "40mg"]},
    {"generic": "Cetirizine", "brands": ["Zyrtec", "Cetzine", "Alerid"], "strengths": ["5mg", "10mg"]},
    {"generic": "Montelukast", "brands": ["Montair", "Singulair", "Montek"], "strengths": ["4mg", "5mg", "10mg"]},
    {"generic": "Metoprolol", "brands": ["Betaloc", "Metolar", "Lopresor"], "strengths": ["25mg", "50mg", "100mg"]},
    {"generic": "Losartan", "brands": ["Losar", "Cozaar", "Losacar"], "strengths": ["25mg", "50mg", "100mg"]},
    {"generic": "Telmisartan", "brands": ["Telma", "Telday", "Telmikind"], "strengths": ["20mg", "40mg", "80mg"]},
    {"generic": "Levothyroxine", "brands": ["Thyronorm", "Eltroxin", "Thyrox"], "strengths": ["25mcg", "50mcg", "75mcg", "100mcg"]},
    {"generic": "Metronidazole", "brands": ["Flagyl", "Metrogyl", "Aristogyl"], "strengths": ["200mg", "400mg"]},
    {"generic": "Ciprofloxacin", "brands": ["Ciplox", "Cifran", "Ciprobid"], "strengths": ["250mg", "500mg"]},
    {"generic": "Levofloxacin", "brands": ["Levomac", "Levoflox", "Tavanic"], "strengths": ["250mg", "500mg", "750mg"]},
    {"generic": "Cefixime", "brands": ["Taxim-O", "Zifi", "Cefspan"], "strengths": ["100mg", "200mg"]},
    {"generic": "Ranitidine", "brands": ["Rantac", "Zinetac", "Aciloc"], "strengths": ["150mg", "300mg"]},
    {"generic": "Domperidone", "brands": ["Domstal", "Motilium", "Vomistop"], "strengths": ["10mg"]},
    {"generic": "Ondansetron", "brands": ["Emeset", "Ondem", "Zofran"], "strengths": ["4mg", "8mg"]},
    {"generic": "Alprazolam", "brands": ["Alprax", "Restyl", "Trika"], "strengths": ["0.25mg", "0.5mg"]},
    {"generic": "Clonazepam", "brands": ["Clonotril", "Rivotril", "Epitril"], "strengths": ["0.25mg", "0.5mg", "1mg"]},
    {"generic": "Gabapentin", "brands": ["Gabapin", "Neurontin", "Gabantin"], "strengths": ["100mg", "300mg", "400mg"]},
    {"generic": "Pregabalin", "brands": ["Pregalin", "Lyrica", "Pregeb"], "strengths": ["50mg", "75mg", "150mg"]},
    {"generic": "Diclofenac", "brands": ["Voveran", "Voltaren", "Diclomax"], "strengths": ["25mg", "50mg", "75mg"]},
    {"generic": "Aceclofenac", "brands": ["Zerodol", "Hifenac", "Acemove"], "strengths": ["100mg", "200mg"]},
    {"generic": "Tramadol", "brands": ["Ultracet", "Tramazac", "Contramal"], "strengths": ["50mg", "100mg"]},
    {"generic": "Clopidogrel", "brands": ["Clopivas", "Plavix", "Clopilet"], "strengths": ["75mg"]},
    {"generic": "Aspirin", "brands": ["Ecosprin", "Disprin", "Aspicot"], "strengths": ["75mg", "150mg", "325mg"]},
    {"generic": "Rosuvastatin", "brands": ["Rosuvas", "Rozavel", "Crestor"], "strengths": ["5mg", "10mg", "20mg"]},
]


def _build_drug_suggestions_cache() -> List[Dict[str, Any]]:
    """Build a flat list of drug suggestions from common drugs"""
    suggestions = []
    
    for drug in COMMON_DRUGS:
        generic = drug["generic"]
        
        # Add generic entry
        suggestions.append({
            "display": f"{generic} (Generic)",
            "value": generic,
            "type": "generic",
            "generic": generic,
            "brand": None,
            "strength": None,
        })
        
        # Add brand entries with strengths
        for brand in drug.get("brands", []):
            # Brand without strength
            suggestions.append({
                "display": f"{brand} ({generic})",
                "value": brand,
                "type": "brand",
                "generic": generic,
                "brand": brand,
                "strength": None,
            })
            
            # Brand with strengths
            for strength in drug.get("strengths", []):
                suggestions.append({
                    "display": f"{brand} {strength} ({generic})",
                    "value": f"{brand} {strength}",
                    "type": "brand",
                    "generic": generic,
                    "brand": brand,
                    "strength": strength,
                })
    
    return suggestions


# Cache of drug suggestions
_DRUG_CACHE: Optional[List[Dict[str, Any]]] = None


def _get_drug_cache() -> List[Dict[str, Any]]:
    """Get or build drug suggestion cache"""
    global _DRUG_CACHE
    if _DRUG_CACHE is None:
        _DRUG_CACHE = _build_drug_suggestions_cache()
        
        # Try to load additional drugs from index
        drugs_index = _load_json(DRUGS_INDEX_PATH)
        if drugs_index:
            for generic in drugs_index.get("canonical_generics", [])[:100]:
                if not any(d["generic"].lower() == generic.lower() for d in _DRUG_CACHE if d.get("type") == "generic"):
                    _DRUG_CACHE.append({
                        "display": f"{generic} (Generic)",
                        "value": generic,
                        "type": "generic",
                        "generic": generic,
                        "brand": None,
                        "strength": None,
                    })
    
    return _DRUG_CACHE


# ============================================================
# Main suggestion function
# ============================================================

def get_suggestions(
    field: str,
    text: str,
    limit: int = 8,
    context: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Get suggestions for a field based on input text.
    
    Args:
        field: One of 'drug', 'frequency', 'duration', 'timing', 'route', 'form', 'instruction', 'diagnosis'
        text: Current input text to match
        limit: Maximum number of suggestions
        context: Optional context (e.g., patient info, other medications)
    
    Returns:
        List of suggestion objects with 'display' and 'value' keys
    """
    text_lower = _normalize(text)
    
    if not text_lower:
        # Return top suggestions when no input
        if field == "drug":
            return _get_drug_cache()[:limit]
        elif field == "frequency":
            return FREQUENCY_SUGGESTIONS[:limit]
        elif field == "duration":
            return DURATION_SUGGESTIONS[:limit]
        elif field == "timing":
            return TIMING_SUGGESTIONS[:limit]
        elif field == "route":
            return ROUTE_SUGGESTIONS[:limit]
        elif field == "form":
            return FORM_SUGGESTIONS[:limit]
        elif field == "instruction":
            return INSTRUCTION_SUGGESTIONS[:limit]
        elif field == "diagnosis":
            return DIAGNOSIS_SUGGESTIONS[:limit]
        return []
    
    # Get appropriate suggestion list
    if field == "drug":
        suggestions = _get_drug_cache()
    elif field == "frequency":
        suggestions = FREQUENCY_SUGGESTIONS
    elif field == "duration":
        suggestions = DURATION_SUGGESTIONS
    elif field == "timing":
        suggestions = TIMING_SUGGESTIONS
    elif field == "route":
        suggestions = ROUTE_SUGGESTIONS
    elif field == "form":
        suggestions = FORM_SUGGESTIONS
    elif field == "instruction":
        suggestions = INSTRUCTION_SUGGESTIONS
    elif field == "diagnosis":
        suggestions = DIAGNOSIS_SUGGESTIONS
    else:
        return []
    
    # Filter by text match
    matches = []
    for s in suggestions:
        display_lower = _normalize(s.get("display", ""))
        value_lower = _normalize(s.get("value", ""))
        
        # Check if text appears in display or value
        if text_lower in display_lower or text_lower in value_lower:
            # Score: starts with > contains
            score = 0
            if display_lower.startswith(text_lower) or value_lower.startswith(text_lower):
                score = 2
            else:
                score = 1
            
            matches.append((score, s))
    
    # Sort by score (descending), then alphabetically
    matches.sort(key=lambda x: (-x[0], x[1].get("display", "").lower()))
    
    return [m[1] for m in matches[:limit]]


def get_drug_suggestions(text: str, limit: int = 8) -> List[Dict[str, Any]]:
    """Convenience function for drug suggestions"""
    return get_suggestions("drug", text, limit)


def get_frequency_suggestions(text: str, limit: int = 8) -> List[Dict[str, Any]]:
    """Convenience function for frequency suggestions"""
    return get_suggestions("frequency", text, limit)


def get_duration_suggestions(text: str, limit: int = 8) -> List[Dict[str, Any]]:
    """Convenience function for duration suggestions"""
    return get_suggestions("duration", text, limit)
