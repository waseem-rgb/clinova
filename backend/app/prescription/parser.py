"""
Prescription Parser - Deterministic text parsing for prescriptions.

Parses free-form text (from voice dictation or typing) into structured
prescription data using deterministic regex patterns.

NO hallucination: Only extracts what is explicitly present in the text.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from .models import RxItem, Diagnosis


# Medication form patterns
FORM_PATTERNS = {
    "tab": r"\b(tab(?:let)?s?)\b",
    "cap": r"\b(cap(?:sule)?s?)\b",
    "syr": r"\b(syr(?:up)?)\b",
    "inj": r"\b(inj(?:ection)?)\b",
    "drops": r"\b(drops?|eye\s*drops?|ear\s*drops?)\b",
    "cream": r"\b(cream)\b",
    "oint": r"\b(oint(?:ment)?)\b",
    "gel": r"\b(gel)\b",
    "susp": r"\b(susp(?:ension)?)\b",
    "powder": r"\b(powder)\b",
    "inhaler": r"\b(inhaler|puff)\b",
    "patch": r"\b(patch)\b",
    "lotion": r"\b(lotion)\b",
}

# Strength patterns
STRENGTH_PATTERN = re.compile(
    r"\b(\d+(?:\.\d+)?)\s*(mg|g|mcg|µg|iu|ml|units?|%)\b",
    re.IGNORECASE
)

# Frequency patterns with normalized output
FREQUENCY_PATTERNS = {
    "OD": [r"\b(od|once\s*(?:a\s*)?daily|once\s*per\s*day|qd)\b"],
    "BD": [r"\b(bd|bid|twice\s*(?:a\s*)?daily|twice\s*per\s*day|2\s*times?\s*(?:a\s*)?day)\b"],
    "TDS": [r"\b(tds|tid|thrice\s*(?:a\s*)?daily|3\s*times?\s*(?:a\s*)?day)\b"],
    "QID": [r"\b(qid|4\s*times?\s*(?:a\s*)?day)\b"],
    "HS": [r"\b(hs|at\s*(?:bed)?night|(?:at\s*)?bedtime)\b"],
    "SOS": [r"\b(sos|as\s*needed|prn|when\s*needed|if\s*needed)\b"],
    "STAT": [r"\b(stat|immediately|right\s*now)\b"],
    "Q4H": [r"\b(q4h|every\s*4\s*hours?)\b"],
    "Q6H": [r"\b(q6h|every\s*6\s*hours?)\b"],
    "Q8H": [r"\b(q8h|every\s*8\s*hours?)\b"],
    "Q12H": [r"\b(q12h|every\s*12\s*hours?)\b"],
    "WEEKLY": [r"\b(weekly|once\s*(?:a\s*)?week)\b"],
    "ALTERNATE DAYS": [r"\b(alternate\s*days?|every\s*other\s*day)\b"],
}

# Duration patterns
DURATION_PATTERN = re.compile(
    r"\b(?:for\s+)?(\d+)\s*(days?|weeks?|months?|wks?)\b",
    re.IGNORECASE
)

# Timing patterns
TIMING_PATTERNS = {
    "Before food": [r"\b(before\s*(?:food|meals?|eating))\b", r"\b(empty\s*stomach)\b", r"\b(ac)\b"],
    "After food": [r"\b(after\s*(?:food|meals?|eating))\b", r"\b(with\s*food)\b", r"\b(pc)\b"],
    "With food": [r"\b(with\s*(?:food|meals?))\b", r"\b(during\s*(?:food|meals?))\b"],
    "Empty stomach": [r"\b(empty\s*stomach)\b", r"\b(on\s*an\s*empty\s*stomach)\b"],
    "At bedtime": [r"\b(at\s*(?:bed)?night)\b", r"\b(before\s*sleep)\b"],
    "Morning": [r"\b(in\s*the\s*morning)\b", r"\b(am|morning)\b"],
    "Evening": [r"\b(in\s*the\s*evening)\b", r"\b(pm|evening)\b"],
}

# Route patterns
ROUTE_PATTERNS = {
    "Oral": [r"\b(oral(?:ly)?|by\s*mouth|po)\b"],
    "IV": [r"\b(iv|intravenous(?:ly)?)\b"],
    "IM": [r"\b(im|intramuscular(?:ly)?)\b"],
    "SC": [r"\b(sc|subcutaneous(?:ly)?|subcut)\b"],
    "Topical": [r"\b(topical(?:ly)?|local(?:ly)?|apply)\b"],
    "Inhalation": [r"\b(inhal(?:e|ation)?|nebuli[sz]e)\b"],
    "Sublingual": [r"\b(sublingual(?:ly)?|under\s*tongue|sl)\b"],
    "Rectal": [r"\b(rectal(?:ly)?|pr)\b"],
    "Nasal": [r"\b(nasal(?:ly)?|intranasal)\b"],
    "Ophthalmic": [r"\b(ophthalmic|eye)\b"],
    "Otic": [r"\b(otic|ear)\b"],
}

# Common drug prefixes that indicate a drug name follows
DRUG_PREFIXES = [
    r"\b(tab|cap|syr|inj)\s+",
    r"\b(give|prescribe|start|continue)\s+",
    r"\brx:?\s*",
]

# Common complaint/symptom keywords
COMPLAINT_KEYWORDS = [
    r"(?:complains?\s*(?:of)?|c/o|presenting\s*with|with|having|suffering\s*from)\s+([^,.;]+)",
    r"(?:pain|ache|fever|cough|cold|headache|weakness|fatigue|nausea|vomiting|diarrhea|constipation|swelling)[^,.;]*",
]

# Diagnosis keywords
DIAGNOSIS_KEYWORDS = [
    r"(?:diagnosis|diagnosed?\s*(?:as|with)?|dx|impression|assessment)\s*:?\s*([^,.;]+)",
]


def _find_pattern(text: str, patterns: dict) -> Optional[str]:
    """Find first matching pattern and return the normalized key"""
    text_lower = text.lower()
    for key, pattern_list in patterns.items():
        for pattern in pattern_list:
            if re.search(pattern, text_lower, re.IGNORECASE):
                return key
    return None


def _find_strength(text: str) -> Optional[str]:
    """Extract strength from text"""
    match = STRENGTH_PATTERN.search(text)
    if match:
        return f"{match.group(1)}{match.group(2).lower()}"
    return None


def _find_form(text: str) -> Optional[str]:
    """Extract medication form from text"""
    text_lower = text.lower()
    for form, pattern in FORM_PATTERNS.items():
        if re.search(pattern, text_lower, re.IGNORECASE):
            return form.capitalize()
    return None


def _find_duration(text: str) -> Optional[str]:
    """Extract duration from text"""
    match = DURATION_PATTERN.search(text)
    if match:
        num = match.group(1)
        unit = match.group(2).lower()
        # Normalize
        if unit.startswith("wk"):
            unit = "week" if num == "1" else "weeks"
        elif not unit.endswith("s") and int(num) > 1:
            unit = unit + "s"
        return f"{num} {unit}"
    return None


def _extract_drug_name(text: str) -> Optional[str]:
    """
    Extract drug name from text segment.
    Very conservative - only extracts clear drug names.
    """
    # Remove common prefixes
    cleaned = text.strip()
    for prefix in DRUG_PREFIXES:
        cleaned = re.sub(prefix, "", cleaned, flags=re.IGNORECASE).strip()
    
    # Remove strength, form, frequency patterns to isolate drug name
    cleaned = STRENGTH_PATTERN.sub("", cleaned)
    cleaned = DURATION_PATTERN.sub("", cleaned)
    for patterns in FORM_PATTERNS.values():
        cleaned = re.sub(patterns, "", cleaned, flags=re.IGNORECASE)
    for patterns in FREQUENCY_PATTERNS.values():
        for p in patterns:
            cleaned = re.sub(p, "", cleaned, flags=re.IGNORECASE)
    for patterns in TIMING_PATTERNS.values():
        for p in patterns:
            cleaned = re.sub(p, "", cleaned, flags=re.IGNORECASE)
    
    # Clean up
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    cleaned = re.sub(r"[,;:\-]+$", "", cleaned).strip()
    
    # Validate - must be at least 3 chars and look like a drug name
    if len(cleaned) >= 3 and re.match(r"^[A-Za-z][A-Za-z0-9\-\s]+$", cleaned):
        # Limit to reasonable length
        words = cleaned.split()[:4]
        return " ".join(words)
    
    return None


def parse_medication_line(line: str) -> Optional[RxItem]:
    """
    Parse a single line/segment that describes a medication.
    Returns RxItem if valid medication found, None otherwise.
    """
    if not line or len(line.strip()) < 3:
        return None
    
    # Extract components
    drug_name = _extract_drug_name(line)
    if not drug_name:
        return None
    
    strength = _find_strength(line)
    form = _find_form(line)
    frequency = _find_pattern(line, FREQUENCY_PATTERNS)
    timing = _find_pattern(line, TIMING_PATTERNS)
    route = _find_pattern(line, ROUTE_PATTERNS)
    duration = _find_duration(line)
    
    # Require at least drug name and frequency
    if not frequency:
        frequency = "OD"  # Default to once daily if not specified
    
    return RxItem(
        generic=drug_name,
        brand=None,
        strength=strength,
        form=form,
        dose=None,
        frequency=frequency,
        timing=timing,
        duration=duration,
        route=route,
        instructions=None
    )


def parse_transcript(text: str) -> Dict[str, Any]:
    """
    Parse a full transcript into structured prescription components.
    
    Returns:
        {
            "complaints": [...],
            "diagnosis": {...},
            "medications": [...],
            "investigations": [...],
            "advice": [...],
            "follow_up": str | None,
            "raw_segments": [...],  # For debugging
        }
    """
    if not text:
        return {
            "complaints": [],
            "diagnosis": None,
            "medications": [],
            "investigations": [],
            "advice": [],
            "follow_up": None,
            "raw_segments": []
        }
    
    # Normalize text
    text = re.sub(r"\s+", " ", text).strip()
    
    # Split into segments by common delimiters
    segments = re.split(r"[.;]\s*|\n+", text)
    segments = [s.strip() for s in segments if s.strip()]
    
    complaints: List[str] = []
    diagnosis_parts: List[str] = []
    medications: List[RxItem] = []
    investigations: List[str] = []
    advice: List[str] = []
    follow_up: Optional[str] = None
    
    for segment in segments:
        segment_lower = segment.lower()
        
        # Check for complaints
        for pattern in COMPLAINT_KEYWORDS:
            match = re.search(pattern, segment, re.IGNORECASE)
            if match:
                if match.groups():
                    complaints.append(match.group(1).strip())
                else:
                    complaints.append(match.group(0).strip())
                break
        
        # Check for diagnosis
        for pattern in DIAGNOSIS_KEYWORDS:
            match = re.search(pattern, segment, re.IGNORECASE)
            if match:
                diagnosis_parts.append(match.group(1).strip())
                break
        
        # Check for investigations
        if any(kw in segment_lower for kw in ["investigate", "test", "check", "order", "send for", "labs", "imaging"]):
            inv = re.sub(r"^(investigate|order|send\s*for|check)\s*:?\s*", "", segment, flags=re.IGNORECASE)
            if inv:
                investigations.append(inv.strip())
            continue
        
        # Check for advice
        if any(kw in segment_lower for kw in ["advise", "advice", "recommend", "suggest"]):
            adv = re.sub(r"^(advise|advice|recommend|suggest)\s*:?\s*", "", segment, flags=re.IGNORECASE)
            if adv:
                advice.append(adv.strip())
            continue
        
        # Check for follow-up
        if any(kw in segment_lower for kw in ["follow up", "follow-up", "review", "come back", "return"]):
            follow_up = segment
            continue
        
        # Try to parse as medication
        # Look for medication indicators
        has_drug_indicator = any([
            re.search(form_pat, segment_lower) for form_pat in FORM_PATTERNS.values()
        ]) or any([
            re.search(freq_pats[0], segment_lower) for freq_pats in FREQUENCY_PATTERNS.values()
        ]) or re.search(STRENGTH_PATTERN, segment)
        
        if has_drug_indicator:
            rx_item = parse_medication_line(segment)
            if rx_item:
                medications.append(rx_item)
    
    # Build diagnosis object
    diagnosis = None
    if diagnosis_parts:
        diagnosis = Diagnosis(
            primary=diagnosis_parts[0] if diagnosis_parts else "",
            provisional=diagnosis_parts[1:] if len(diagnosis_parts) > 1 else []
        )
    
    return {
        "complaints": list(set(complaints)),  # Remove duplicates
        "diagnosis": diagnosis.dict() if diagnosis else None,
        "medications": [m.dict() for m in medications],
        "investigations": list(set(investigations)),
        "advice": list(set(advice)),
        "follow_up": follow_up,
        "raw_segments": segments
    }


def normalize_drug_name(name: str) -> str:
    """
    Normalize a drug name for matching.
    Strips common prefixes/suffixes, lowercases, removes extra spaces.
    """
    name = (name or "").strip().lower()
    
    # Remove common prefixes
    prefixes = ["tab", "cap", "syr", "inj", "tablet", "capsule", "syrup", "injection"]
    for prefix in prefixes:
        if name.startswith(prefix + " "):
            name = name[len(prefix):].strip()
    
    # Remove strength at end
    name = STRENGTH_PATTERN.sub("", name).strip()
    
    return name


def extract_medications_from_text(text: str) -> List[Dict[str, Any]]:
    """
    Convenience function to extract just medications from text.
    """
    result = parse_transcript(text)
    return result.get("medications", [])
