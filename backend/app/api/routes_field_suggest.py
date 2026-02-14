# backend/app/api/routes_field_suggest.py
"""
DOCTOR-GRADE Universal Smart Field Suggest endpoint.

Provides RAG-based + AI-cleaned suggestions for ALL input fields
with workspace context awareness and clinical appropriateness.

Key features:
- Workspace-aware: Uses case context for better suggestions
- Evidence-first: Prefers RAG-retrieved terms over LLM
- Clinical safety: Includes must-not-miss emergency differentials
- Junk-free: Robust filtering of index artifacts and partial words
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from functools import lru_cache
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(tags=["field-suggest"])


# =============================================================================
# SCHEMAS
# =============================================================================

class FieldSuggestRequest(BaseModel):
    field: str = Field(..., description="Field type: symptom|comorbidity|allergy|medication|renal_status|hepatic_status|condition|drug|interaction_drug|generic")
    q: str = Field(..., description="User typed text")
    context: Optional[Dict[str, Any]] = Field(None, description="Optional patient context")
    case_id: Optional[str] = Field(None, description="Workspace case ID for context-aware suggestions")
    limit: int = Field(12, ge=1, le=20)


class SuggestionItem(BaseModel):
    label: str
    canonical: Optional[str] = None
    type: str


class FieldSuggestResponse(BaseModel):
    items: List[SuggestionItem]
    field: str
    query: str


# =============================================================================
# STATIC SUGGESTION LISTS (for fallback / base matching)
# =============================================================================

SYMPTOM_BASE = [
    "fever", "cough", "shortness of breath", "chest pain", "headache",
    "fatigue", "nausea", "vomiting", "diarrhea", "abdominal pain",
    "back pain", "joint pain", "muscle pain", "dizziness", "syncope",
    "palpitations", "edema", "weight loss", "weight gain", "night sweats",
    "hemoptysis", "dysphagia", "constipation", "hematuria", "dysuria",
    "polyuria", "oliguria", "rash", "pruritus", "jaundice",
]

COMORBIDITY_BASE = [
    "diabetes mellitus", "hypertension", "coronary artery disease",
    "heart failure", "atrial fibrillation", "chronic kidney disease",
    "chronic obstructive pulmonary disease", "asthma", "obesity",
    "hypothyroidism", "hyperthyroidism", "cirrhosis", "chronic liver disease",
    "stroke", "peripheral vascular disease", "anemia", "depression",
    "anxiety", "rheumatoid arthritis", "osteoarthritis",
]

ALLERGY_BASE = [
    "penicillin", "sulfa drugs", "aspirin", "NSAIDs", "codeine",
    "morphine", "contrast dye", "latex", "shellfish", "peanuts",
    "amoxicillin", "cephalosporins", "fluoroquinolones", "macrolides",
    "tetracyclines", "vancomycin", "metformin", "ACE inhibitors",
]

RENAL_STATUS_BASE = [
    "normal", "CKD stage 1", "CKD stage 2", "CKD stage 3a", "CKD stage 3b",
    "CKD stage 4", "CKD stage 5", "ESRD on dialysis", "acute kidney injury",
    "eGFR >90", "eGFR 60-89", "eGFR 45-59", "eGFR 30-44", "eGFR 15-29", "eGFR <15",
]

HEPATIC_STATUS_BASE = [
    "normal", "mild hepatic impairment", "moderate hepatic impairment",
    "severe hepatic impairment", "cirrhosis Child-Pugh A", "cirrhosis Child-Pugh B",
    "cirrhosis Child-Pugh C", "acute liver failure", "chronic hepatitis",
    "fatty liver disease", "alcoholic liver disease",
]

CONDITION_BASE = [
    "pneumonia", "urinary tract infection", "cellulitis", "sepsis",
    "acute coronary syndrome", "heart failure exacerbation", "COPD exacerbation",
    "asthma exacerbation", "diabetic ketoacidosis", "hypoglycemia",
    "stroke", "transient ischemic attack", "deep vein thrombosis",
    "pulmonary embolism", "acute pancreatitis", "cholecystitis",
    "appendicitis", "diverticulitis", "meningitis", "encephalitis",
]

FIELD_BASE_MAP = {
    "symptom": SYMPTOM_BASE,
    "comorbidity": COMORBIDITY_BASE,
    "allergy": ALLERGY_BASE,
    "medication": [],  # Use drug search
    "renal_status": RENAL_STATUS_BASE,
    "hepatic_status": HEPATIC_STATUS_BASE,
    "condition": CONDITION_BASE,
    "drug": [],  # Use drug search
    "interaction_drug": [],  # Use drug search
    "generic": [],
}


# =============================================================================
# CLINICAL CONTEXT-AWARE SUGGESTIONS (Must-not-miss emergencies)
# =============================================================================

# When symptoms suggest emergency, prioritize these conditions
SYMPTOM_TO_EMERGENCY_CONDITIONS = {
    "chest pain": [
        "acute coronary syndrome",
        "pulmonary embolism",
        "aortic dissection",
        "tension pneumothorax",
        "esophageal rupture",
    ],
    "shortness of breath": [
        "pulmonary embolism",
        "acute heart failure",
        "pneumothorax",
        "anaphylaxis",
        "severe asthma",
    ],
    "headache": [
        "subarachnoid hemorrhage",
        "meningitis",
        "intracranial mass",
        "temporal arteritis",
        "hypertensive emergency",
    ],
    "abdominal pain": [
        "appendicitis",
        "bowel obstruction",
        "ruptured AAA",
        "ectopic pregnancy",
        "perforated viscus",
    ],
    "fever": [
        "sepsis",
        "meningitis",
        "endocarditis",
        "necrotizing fasciitis",
        "neutropenic fever",
    ],
    "syncope": [
        "cardiac arrhythmia",
        "pulmonary embolism",
        "aortic stenosis",
        "subarachnoid hemorrhage",
        "hypoglycemia",
    ],
}

# Common drug interactions to suggest checking
COMORBIDITY_TO_DRUG_CAUTIONS = {
    "chronic kidney disease": ["NSAIDs", "metformin", "aminoglycosides", "ACE inhibitors"],
    "heart failure": ["NSAIDs", "thiazolidinediones", "verapamil", "diltiazem"],
    "cirrhosis": ["acetaminophen", "metformin", "statins", "opioids"],
    "diabetes mellitus": ["steroids", "thiazides", "beta-blockers", "fluoroquinolones"],
}


def get_workspace_context(case_id: Optional[str]) -> Dict[str, Any]:
    """Fetch workspace context for smarter suggestions."""
    if not case_id:
        return {}
    
    try:
        from app.workspace.store import get_store
        store = get_store()
        case = store.get_case(case_id)
        if case:
            return {
                "symptoms": case.context.symptoms,
                "comorbidities": case.context.comorbidities,
                "selected_ddx": case.context.selected_ddx,
                "current_meds": case.context.current_meds,
                "lab_abnormalities": case.context.lab_abnormalities,
                "renal_status": case.context.renal_status,
                "hepatic_status": case.context.hepatic_status,
            }
    except Exception:
        pass
    
    return {}


def get_clinical_suggestions(
    field: str,
    q: str,
    workspace_context: Dict[str, Any],
) -> List[str]:
    """
    Get clinically-appropriate suggestions based on workspace context.
    
    For example, if symptoms include "chest pain", suggest emergency conditions first.
    """
    suggestions = []
    
    if field == "condition":
        # Check if current symptoms match emergency patterns
        symptoms = workspace_context.get("symptoms", "") or ""
        symptoms_lower = symptoms.lower()
        
        for trigger, emergencies in SYMPTOM_TO_EMERGENCY_CONDITIONS.items():
            if trigger in symptoms_lower:
                # Add must-not-miss emergencies first
                for emerg in emergencies:
                    if q.lower() in emerg.lower() or emerg.lower().startswith(q.lower()):
                        suggestions.append(emerg)
    
    elif field in ("drug", "medication", "interaction_drug"):
        # Suggest drugs to check based on comorbidities
        comorbidities = workspace_context.get("comorbidities", []) or []
        
        for comorbid, caution_drugs in COMORBIDITY_TO_DRUG_CAUTIONS.items():
            if any(comorbid.lower() in c.lower() for c in comorbidities):
                for drug in caution_drugs:
                    if q.lower() in drug.lower():
                        suggestions.append(f"{drug} (caution with {comorbid})")
    
    return suggestions[:5]  # Limit clinical suggestions


# =============================================================================
# JUNK FILTERS
# =============================================================================

JUNK_PATTERNS = [
    r"^\d+$",  # Just numbers
    r"^[a-z]$",  # Single letter
    r"^see\s",  # "see ..."
    r"^also\s",  # "also ..."
    r"chapter\s+\d",  # chapter references
    r"page\s+\d",  # page references
    r"^\d+[tf]$",  # page markers like "3412t"
    r"^p\.\s*\d",  # "p. 123"
    r"^\s*[-–—]\s*$",  # Just dashes
    r"^et\s+al",  # "et al"
    r"^\d+[-–]\d+$",  # Page ranges
    r"^fig\.\s*\d",  # Figure references
    r"^table\s+\d",  # Table references
    r"^\(\d+\)$",  # Just numbers in parens
]

JUNK_REGEX = [re.compile(p, re.IGNORECASE) for p in JUNK_PATTERNS]


def is_junk(text: str) -> bool:
    """Check if text matches junk patterns."""
    text = text.strip()
    if len(text) < 2:
        return True
    if len(text) > 100:
        return True
    for pattern in JUNK_REGEX:
        if pattern.search(text):
            return True
    return False


def normalize_suggestion(text: str) -> str:
    """Normalize a suggestion string."""
    # Strip whitespace
    text = text.strip()
    # Remove multiple spaces
    text = re.sub(r"\s+", " ", text)
    # Remove trailing punctuation (except parentheses)
    text = re.sub(r"[,;:\.]+$", "", text)
    # Fix common issues
    text = text.replace("diabetes mellitu", "diabetes mellitus")
    return text


# =============================================================================
# RAG RETRIEVAL HELPERS
# =============================================================================

def retrieve_from_topic_index(q: str, limit: int = 20) -> List[str]:
    """
    Retrieve suggestions from Harrison topic index.
    """
    try:
        from app.api.routes_suggest import _suggest_titles
        return _suggest_titles(q=q, limit=limit, min_chunks=10)
    except Exception:
        return []


def retrieve_from_drug_catalog(q: str, limit: int = 20) -> List[str]:
    """
    Retrieve suggestions from drug catalog.
    """
    try:
        from app.services.drugs_catalog import search_suggestions
        results = search_suggestions(q, limit=limit)
        # Results are dicts with 'display' key, not objects
        return [r.get('display') for r in results if isinstance(r, dict) and r.get('display')]
    except Exception:
        return []


def retrieve_from_base_list(field: str, q: str, limit: int = 20) -> List[str]:
    """
    Retrieve suggestions from base lists with fuzzy matching.
    """
    import difflib
    
    base = FIELD_BASE_MAP.get(field, [])
    if not base:
        return []
    
    q_lower = q.lower().strip()
    
    # Prefix matches first
    prefix_matches = [s for s in base if s.lower().startswith(q_lower)]
    
    # Contains matches second
    contains_matches = [s for s in base if q_lower in s.lower() and s not in prefix_matches]
    
    # Fuzzy matches last
    fuzzy_matches = difflib.get_close_matches(q_lower, base, n=limit, cutoff=0.6)
    fuzzy_matches = [s for s in fuzzy_matches if s not in prefix_matches and s not in contains_matches]
    
    combined = prefix_matches + contains_matches + fuzzy_matches
    return combined[:limit]


# =============================================================================
# CACHING
# =============================================================================

# In-memory cache with TTL
_suggestion_cache: Dict[str, Tuple[datetime, List[SuggestionItem]]] = {}
CACHE_TTL = timedelta(minutes=5)


def _cache_key(field: str, q: str, context_hash: str) -> str:
    """Generate cache key."""
    return f"{field}:{q.lower().strip()}:{context_hash}"


def _context_hash(context: Optional[Dict[str, Any]]) -> str:
    """Hash context for cache key."""
    if not context:
        return "none"
    return hashlib.md5(json.dumps(context, sort_keys=True).encode()).hexdigest()[:8]


def get_cached(field: str, q: str, context: Optional[Dict[str, Any]]) -> Optional[List[SuggestionItem]]:
    """Get cached suggestions if available and not expired."""
    key = _cache_key(field, q, _context_hash(context))
    if key in _suggestion_cache:
        cached_time, items = _suggestion_cache[key]
        if datetime.utcnow() - cached_time < CACHE_TTL:
            return items
        else:
            del _suggestion_cache[key]
    return None


def set_cached(field: str, q: str, context: Optional[Dict[str, Any]], items: List[SuggestionItem]) -> None:
    """Cache suggestions."""
    key = _cache_key(field, q, _context_hash(context))
    _suggestion_cache[key] = (datetime.utcnow(), items)
    
    # Evict old entries if cache gets too big
    if len(_suggestion_cache) > 500:
        cutoff = datetime.utcnow() - CACHE_TTL
        to_delete = [k for k, (t, _) in _suggestion_cache.items() if t < cutoff]
        for k in to_delete:
            del _suggestion_cache[k]


# =============================================================================
# LLM CLEANING
# =============================================================================

def clean_suggestions(
    field: str,
    q: str,
    raw_suggestions: List[str],
    limit: int = 12,
) -> List[str]:
    """
    Clean and deduplicate suggestions using RULE-BASED cleaning only.
    
    NO LLM CALL - this prevents 502 timeouts on the suggest endpoint.
    The suggest endpoint must be fast (<300ms) for good UX.
    """
    return _rule_based_clean(raw_suggestions, limit)


def _rule_based_clean(suggestions: List[str], limit: int) -> List[str]:
    """Rule-based cleaning fallback."""
    seen = set()
    cleaned = []
    
    for s in suggestions:
        s = normalize_suggestion(s)
        if not s or is_junk(s):
            continue
        
        key = s.lower()
        if key in seen:
            continue
        seen.add(key)
        
        cleaned.append(s)
        if len(cleaned) >= limit:
            break
    
    return cleaned


# =============================================================================
# MAIN ENDPOINT
# =============================================================================

@router.post("/suggest/field", response_model=FieldSuggestResponse)
async def suggest_field(request: FieldSuggestRequest) -> FieldSuggestResponse:
    """
    Doctor-grade smart field suggestion endpoint.
    
    Provides workspace-aware, evidence-first suggestions with clinical safety features.
    
    Features:
    - Workspace context-aware: Uses case symptoms/comorbidities for better suggestions
    - Must-not-miss emergencies: Prioritizes critical diagnoses for relevant symptoms
    - Drug cautions: Suggests drugs with warnings based on comorbidities
    - Junk-free: Robust filtering of index artifacts and partial words
    
    Fields supported:
    - symptom: Clinical symptoms
    - comorbidity: Chronic conditions
    - allergy: Drug/food allergies
    - medication: Current medications
    - renal_status: Renal function status
    - hepatic_status: Hepatic function status
    - condition: Disease/diagnosis
    - drug: Drug names
    - interaction_drug: Drugs for interaction check
    - generic: General text
    
    The endpoint:
    1. Fetches workspace context (if case_id provided)
    2. Adds clinical must-not-miss suggestions based on symptoms
    3. Retrieves candidates from RAG (topic index, drug catalog, base lists)
    4. Filters junk (page refs, index artifacts)
    5. Cleans via LLM (dedup, normalize, ensure complete terms)
    6. Returns max 12 clean suggestions
    """
    field = request.field.lower().strip()
    q = request.q.strip()
    
    if len(q) < 2:
        return FieldSuggestResponse(items=[], field=field, query=q)
    
    # Check cache (include case_id in cache consideration)
    cache_context = dict(request.context or {})
    if request.case_id:
        cache_context["_case_id"] = request.case_id
    
    cached = get_cached(field, q, cache_context if cache_context else None)
    if cached is not None:
        return FieldSuggestResponse(items=cached, field=field, query=q)
    
    # =======================================================================
    # WORKSPACE CONTEXT AWARENESS
    # =======================================================================
    workspace_context = get_workspace_context(request.case_id)
    
    # Get clinical suggestions based on workspace context (must-not-miss emergencies)
    clinical_priority_suggestions = get_clinical_suggestions(field, q, workspace_context)
    
    # =======================================================================
    # RAG RETRIEVAL
    # =======================================================================
    raw_suggestions: List[str] = []
    
    if field in ("drug", "medication", "interaction_drug", "allergy"):
        # Use drug catalog
        raw_suggestions = retrieve_from_drug_catalog(q, limit=30)
        # Also include base list for allergies
        if field == "allergy":
            raw_suggestions += retrieve_from_base_list("allergy", q, limit=15)
    
    elif field in ("condition", "disease"):
        # Use topic index
        raw_suggestions = retrieve_from_topic_index(q, limit=30)
        raw_suggestions += retrieve_from_base_list("condition", q, limit=15)
    
    else:
        # Use base list for other fields
        raw_suggestions = retrieve_from_base_list(field, q, limit=30)
    
    # Filter obvious junk before LLM
    raw_suggestions = [s for s in raw_suggestions if not is_junk(s)]
    
    # =======================================================================
    # MERGE CLINICAL PRIORITY + RAG SUGGESTIONS
    # =======================================================================
    # Clinical priority suggestions go first (must-not-miss emergencies)
    combined_suggestions = clinical_priority_suggestions + [
        s for s in raw_suggestions
        if s.lower() not in [c.lower() for c in clinical_priority_suggestions]
    ]
    
    # Clean suggestions (rule-based only - no LLM call for speed)
    cleaned = clean_suggestions(field, q, combined_suggestions, limit=request.limit)
    
    # =======================================================================
    # BUILD RESPONSE
    # =======================================================================
    items = []
    
    # Mark clinical priority suggestions
    for s in cleaned:
        is_priority = any(
            s.lower() in c.lower() or c.lower() in s.lower()
            for c in clinical_priority_suggestions
        )
        
        items.append(SuggestionItem(
            label=f"[!] {s}" if is_priority and "caution" not in s.lower() else s,
            canonical=s.lower().replace(" ", "_").replace("[!] ", ""),
            type=f"{field}_priority" if is_priority else field,
        ))
    
    # Cache result
    set_cached(field, q, cache_context if cache_context else None, items)
    
    return FieldSuggestResponse(items=items, field=field, query=q)
