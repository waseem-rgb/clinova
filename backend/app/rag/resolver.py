# backend/app/rag/resolver.py
"""
Evidence Gap Resolver - DOCTOR GRADE.

Ensures RAG is tried exhaustively before any LLM fallback.
This module implements:
1. Expanded retrieval (higher top_k, looser filters)
2. Query rewriting (synonyms, abbreviations, severity variants)
3. Section-specific retrieval ("dose", "treatment of choice", etc.)
4. Cross-book routing (Harrison/Oxford for disease, MIMS/KD for drugs)
5. Coverage scoring to determine if evidence is sufficient

HARD RULE: Only "insufficient_final" status allows LLM fallback.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple

from app.rag.retrieve.query import retrieve_chunks
from app.rag.cleaners.text_cleaner import (
    filter_and_clean_chunks,
    sort_by_book_priority,
)


# =============================================================================
# TYPES
# =============================================================================

class CoverageStatus(str, Enum):
    """Evidence coverage status."""
    SUFFICIENT = "sufficient"
    INSUFFICIENT_RECOVERABLE = "insufficient_recoverable"
    INSUFFICIENT_FINAL = "insufficient_final"


class SectionType(str, Enum):
    """Section types for targeted retrieval."""
    # Treatment sections
    TREATMENT_OF_CHOICE = "treatment_of_choice"
    FIRST_LINE = "first_line"
    SECOND_LINE = "second_line"
    DOSE = "dose"
    CONTRAINDICATIONS = "contraindications"
    MONITORING = "monitoring"
    RED_FLAGS = "red_flags"
    
    # DDx sections
    DIFFERENTIAL = "differential"
    WORKUP = "workup"
    MUST_NOT_MISS = "must_not_miss"
    INVESTIGATIONS = "investigations"
    
    # Drug sections
    MECHANISM = "mechanism"
    INDICATIONS = "indications"
    ADVERSE_EFFECTS = "adverse_effects"
    INTERACTIONS = "interactions"
    BRANDS = "brands"
    
    # General
    OVERVIEW = "overview"


@dataclass
class ResolverResult:
    """Result from Evidence Gap Resolver."""
    best_chunks: List[Dict[str, Any]]
    coverage_status: CoverageStatus
    section_scores: Dict[str, float] = field(default_factory=dict)
    fallback_allowed: bool = False
    resolver_log: List[str] = field(default_factory=list)
    total_retrieved: int = 0
    total_kept: int = 0
    queries_used: List[str] = field(default_factory=list)
    

# =============================================================================
# QUERY EXPANSION STRATEGIES
# =============================================================================

# Medical abbreviations and synonyms
TERM_EXPANSIONS = {
    # Symptoms
    "sob": ["shortness of breath", "dyspnea", "breathlessness"],
    "cp": ["chest pain", "angina", "precordial pain"],
    "ha": ["headache", "cephalgia"],
    "ams": ["altered mental status", "confusion", "encephalopathy"],
    "loc": ["loss of consciousness", "syncope", "fainting"],
    "n/v": ["nausea", "vomiting", "emesis"],
    "abd pain": ["abdominal pain", "stomach pain", "belly pain"],
    
    # Conditions
    "dm": ["diabetes mellitus", "diabetes", "type 2 diabetes", "T2DM"],
    "htn": ["hypertension", "high blood pressure", "elevated BP"],
    "cad": ["coronary artery disease", "ischemic heart disease", "CHD"],
    "chf": ["congestive heart failure", "heart failure", "cardiac failure"],
    "ckd": ["chronic kidney disease", "renal failure", "nephropathy"],
    "copd": ["chronic obstructive pulmonary disease", "emphysema", "chronic bronchitis"],
    "uti": ["urinary tract infection", "cystitis", "bladder infection"],
    "cap": ["community acquired pneumonia", "pneumonia"],
    "pe": ["pulmonary embolism", "pulmonary thromboembolism"],
    "dvt": ["deep vein thrombosis", "venous thrombosis"],
    "mi": ["myocardial infarction", "heart attack", "STEMI", "NSTEMI"],
    "acs": ["acute coronary syndrome", "unstable angina"],
    
    # Drugs
    "nsaid": ["NSAID", "non-steroidal anti-inflammatory", "ibuprofen", "naproxen"],
    "ace": ["ACE inhibitor", "angiotensin converting enzyme inhibitor"],
    "arb": ["angiotensin receptor blocker", "ARB"],
    "ppi": ["proton pump inhibitor", "omeprazole", "pantoprazole"],
    "ssri": ["selective serotonin reuptake inhibitor", "SSRI"],
}

# Section-specific query patterns
SECTION_QUERY_PATTERNS = {
    SectionType.TREATMENT_OF_CHOICE: [
        "{topic} treatment of choice",
        "{topic} first line therapy",
        "{topic} recommended treatment",
        "{topic} guideline treatment",
        "{topic} standard of care",
    ],
    SectionType.FIRST_LINE: [
        "{topic} first line regimen",
        "{topic} initial therapy",
        "{topic} empiric treatment",
        "{topic} first line drug",
    ],
    SectionType.SECOND_LINE: [
        "{topic} second line treatment",
        "{topic} alternative therapy",
        "{topic} rescue therapy",
        "{topic} if first line fails",
    ],
    SectionType.DOSE: [
        "{topic} dose dosing",
        "{topic} mg mcg dose",
        "{topic} dosage regimen",
        "{topic} adult dose pediatric dose",
        "{topic} dose adjustment",
        "{topic} how much to give",
    ],
    SectionType.CONTRAINDICATIONS: [
        "{topic} contraindication",
        "{topic} avoid in",
        "{topic} do not use",
        "{topic} caution warning",
    ],
    SectionType.MONITORING: [
        "{topic} monitoring",
        "{topic} follow up",
        "{topic} what to check",
        "{topic} labs to monitor",
    ],
    SectionType.RED_FLAGS: [
        "{topic} red flags",
        "{topic} warning signs",
        "{topic} when to refer",
        "{topic} urgent escalation",
        "{topic} emergency",
    ],
    SectionType.DIFFERENTIAL: [
        "{topic} differential diagnosis",
        "{topic} causes",
        "{topic} etiology",
        "{topic} DDx",
    ],
    SectionType.WORKUP: [
        "{topic} workup",
        "{topic} evaluation",
        "{topic} assessment",
        "{topic} diagnostic approach",
    ],
    SectionType.MUST_NOT_MISS: [
        "{topic} must not miss",
        "{topic} life threatening",
        "{topic} dangerous causes",
        "{topic} emergencies",
    ],
    SectionType.INVESTIGATIONS: [
        "{topic} investigations",
        "{topic} lab tests",
        "{topic} imaging",
        "{topic} diagnostic tests",
    ],
    SectionType.MECHANISM: [
        "{topic} mechanism of action",
        "{topic} pharmacology",
        "{topic} how it works",
    ],
    SectionType.INDICATIONS: [
        "{topic} indications",
        "{topic} uses",
        "{topic} approved for",
    ],
    SectionType.ADVERSE_EFFECTS: [
        "{topic} adverse effects",
        "{topic} side effects",
        "{topic} toxicity",
    ],
    SectionType.INTERACTIONS: [
        "{topic} drug interactions",
        "{topic} contraindicated with",
        "{topic} avoid combination",
    ],
    SectionType.BRANDS: [
        "{topic} brand name india",
        "{topic} trade name",
        "{topic} available brands",
    ],
    SectionType.OVERVIEW: [
        "{topic}",
        "{topic} overview",
        "{topic} definition",
    ],
}

# Book routing for different content types
BOOK_ROUTING = {
    "disease": {
        "primary": ["medicine_harrison", "surgery_oxford", "pediatrics_oxford", "obgyn_dutta"],
        "secondary": ["drugs_mims_kd", "kd_tripathi"],
    },
    "drug": {
        "primary": ["drugs_mims_kd", "kd_tripathi"],
        "secondary": ["medicine_harrison"],
    },
    "treatment": {
        "primary": ["medicine_harrison", "surgery_oxford"],
        "secondary": ["drugs_mims_kd", "kd_tripathi"],
    },
    "dose": {
        "primary": ["drugs_mims_kd", "kd_tripathi"],
        "secondary": ["medicine_harrison"],
    },
}


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def expand_query_terms(query: str) -> List[str]:
    """Expand a query with synonyms and abbreviations."""
    queries = [query]
    query_lower = query.lower()
    
    for abbrev, expansions in TERM_EXPANSIONS.items():
        if abbrev in query_lower:
            for exp in expansions:
                expanded = re.sub(re.escape(abbrev), exp, query_lower, flags=re.IGNORECASE)
                if expanded != query_lower and expanded not in queries:
                    queries.append(expanded)
    
    return queries


def get_section_queries(topic: str, sections: List[SectionType]) -> Dict[SectionType, List[str]]:
    """Generate queries for specific sections."""
    result = {}
    for section in sections:
        patterns = SECTION_QUERY_PATTERNS.get(section, ["{topic}"])
        queries = [p.format(topic=topic) for p in patterns]
        result[section] = queries
    return result


def score_chunk_for_section(chunk: Dict[str, Any], section: SectionType) -> float:
    """Score how well a chunk covers a specific section."""
    text = (chunk.get("text") or "").lower()
    score = 0.0
    
    # Section-specific keywords
    section_keywords = {
        SectionType.DOSE: ["mg", "mcg", "dose", "dosing", "units", "ml", "g/kg", "bd", "tds", "qid", "od", "once daily", "twice daily"],
        SectionType.TREATMENT_OF_CHOICE: ["treatment of choice", "first-line", "recommended", "preferred", "drug of choice"],
        SectionType.FIRST_LINE: ["first line", "first-line", "initial", "empiric", "starting"],
        SectionType.SECOND_LINE: ["second line", "second-line", "alternative", "rescue", "refractory"],
        SectionType.CONTRAINDICATIONS: ["contraindicated", "avoid", "do not use", "caution", "warning", "black box"],
        SectionType.MONITORING: ["monitor", "check", "follow up", "assess", "measure"],
        SectionType.RED_FLAGS: ["red flag", "warning sign", "emergency", "urgent", "life-threatening"],
        SectionType.DIFFERENTIAL: ["differential", "ddx", "causes", "etiology"],
        SectionType.WORKUP: ["workup", "evaluation", "assessment", "approach"],
        SectionType.MECHANISM: ["mechanism", "pharmacology", "works by", "acts on"],
        SectionType.ADVERSE_EFFECTS: ["adverse", "side effect", "toxicity", "reaction"],
        SectionType.INTERACTIONS: ["interaction", "contraindicated with", "avoid with"],
        SectionType.BRANDS: ["brand", "trade name", "available as"],
    }
    
    keywords = section_keywords.get(section, [])
    for kw in keywords:
        if kw in text:
            score += 2.0
    
    # Bonus for longer, more detailed chunks
    if len(text) > 500:
        score += 1.0
    if len(text) > 1000:
        score += 0.5
    
    return score


def calculate_section_coverage(
    chunks: List[Dict[str, Any]],
    sections: List[SectionType],
) -> Dict[SectionType, float]:
    """Calculate coverage score for each section."""
    coverage = {section: 0.0 for section in sections}
    
    for section in sections:
        best_score = 0.0
        for chunk in chunks:
            score = score_chunk_for_section(chunk, section)
            if score > best_score:
                best_score = score
        coverage[section] = min(best_score / 6.0, 1.0)  # Normalize to 0-1
    
    return coverage


# =============================================================================
# MAIN RESOLVER
# =============================================================================

def resolve_evidence(
    *,
    topic: str,
    feature: str,  # "ddx" | "treatment" | "drug" | "interaction"
    sections: List[SectionType],
    user_context: Optional[Dict[str, Any]] = None,
    initial_chunks: Optional[List[Dict[str, Any]]] = None,
    max_total_chunks: int = 40,
    min_coverage_threshold: float = 0.3,
) -> ResolverResult:
    """
    Main Evidence Gap Resolver function.
    
    Args:
        topic: The medical topic/condition/drug to resolve
        feature: Which feature is calling (ddx, treatment, drug, interaction)
        sections: Which sections need coverage
        user_context: Optional patient context
        initial_chunks: Previously retrieved chunks (if any)
        max_total_chunks: Maximum chunks to return
        min_coverage_threshold: Minimum average section coverage to be "sufficient"
    
    Returns:
        ResolverResult with best_chunks, coverage_status, and debug info
    """
    log = []
    all_chunks: List[Dict[str, Any]] = []
    seen_ids: Set[str] = set()
    queries_used: List[str] = []
    
    # Step 0: Include initial chunks
    if initial_chunks:
        for chunk in initial_chunks:
            cid = chunk.get("chunk_id") or chunk.get("content_hash") or ""
            if cid and cid not in seen_ids:
                seen_ids.add(cid)
                all_chunks.append(chunk)
        log.append(f"Started with {len(all_chunks)} initial chunks")
    
    # Step 1: Expand topic query
    expanded_topics = expand_query_terms(topic)
    log.append(f"Expanded topic into {len(expanded_topics)} variants")
    
    # Step 2: Generate section-specific queries
    section_queries = get_section_queries(topic, sections)
    
    # Step 3: Determine book routing
    content_type = "disease"
    if feature == "drug":
        content_type = "drug"
    elif feature == "treatment" and any(s in sections for s in [SectionType.DOSE, SectionType.BRANDS]):
        content_type = "dose"
    elif feature == "treatment":
        content_type = "treatment"
    
    routing = BOOK_ROUTING.get(content_type, BOOK_ROUTING["disease"])
    
    # Step 4: First retrieval pass - primary books
    log.append("Pass 1: Primary book retrieval")
    for section, queries in section_queries.items():
        for query in queries[:3]:  # Limit queries per section
            for exp_topic in expanded_topics[:2]:  # Limit expanded topics
                full_query = query if exp_topic in query else f"{exp_topic} {query.replace(topic, '').strip()}"
                queries_used.append(full_query)
                
                # Try core_textbooks for disease content
                if "harrison" in routing["primary"][0] or content_type == "disease":
                    try:
                        chunks = retrieve_chunks(query=full_query, collection_key="core_textbooks", top_k=8)
                        for chunk in chunks:
                            cid = chunk.get("chunk_id") or ""
                            if cid and cid not in seen_ids:
                                seen_ids.add(cid)
                                all_chunks.append(chunk)
                    except Exception as e:
                        log.append(f"Error retrieving from core_textbooks: {e}")
                
                # Try drugs_mims for drug content
                if "mims" in str(routing["primary"]) or content_type in ["drug", "dose"]:
                    try:
                        chunks = retrieve_chunks(query=full_query, collection_key="drugs_mims", top_k=8)
                        for chunk in chunks:
                            cid = chunk.get("chunk_id") or ""
                            if cid and cid not in seen_ids:
                                seen_ids.add(cid)
                                all_chunks.append(chunk)
                    except Exception as e:
                        log.append(f"Error retrieving from drugs_mims: {e}")
                
                if len(all_chunks) >= max_total_chunks * 1.5:
                    break
            if len(all_chunks) >= max_total_chunks * 1.5:
                break
        if len(all_chunks) >= max_total_chunks * 1.5:
            break
    
    log.append(f"After Pass 1: {len(all_chunks)} total chunks")
    
    # Step 5: Check coverage after first pass
    # Clean and filter chunks first
    query_terms = [topic] + topic.split() + expanded_topics[:3]
    cleaned_chunks, dropped = filter_and_clean_chunks(
        all_chunks,
        feature=feature,
        query_terms=query_terms,
        max_chunks=max_total_chunks,
    )
    
    coverage = calculate_section_coverage(cleaned_chunks, sections)
    avg_coverage = sum(coverage.values()) / len(coverage) if coverage else 0.0
    log.append(f"Coverage after Pass 1: {avg_coverage:.2f} (threshold: {min_coverage_threshold})")
    
    # Step 6: Second retrieval pass if coverage insufficient
    if avg_coverage < min_coverage_threshold:
        log.append("Pass 2: Expanded retrieval (coverage insufficient)")
        
        # Identify weak sections
        weak_sections = [s for s, score in coverage.items() if score < 0.3]
        log.append(f"Weak sections: {[s.value for s in weak_sections]}")
        
        for section in weak_sections:
            queries = section_queries.get(section, [])
            for query in queries:
                # Higher top_k for weak sections
                try:
                    chunks = retrieve_chunks(query=query, collection_key="core_textbooks", top_k=12)
                    for chunk in chunks:
                        cid = chunk.get("chunk_id") or ""
                        if cid and cid not in seen_ids:
                            seen_ids.add(cid)
                            all_chunks.append(chunk)
                except Exception:
                    pass
                
                try:
                    chunks = retrieve_chunks(query=query, collection_key="drugs_mims", top_k=12)
                    for chunk in chunks:
                        cid = chunk.get("chunk_id") or ""
                        if cid and cid not in seen_ids:
                            seen_ids.add(cid)
                            all_chunks.append(chunk)
                except Exception:
                    pass
                
                queries_used.append(query)
        
        # Re-clean and re-score
        cleaned_chunks, dropped = filter_and_clean_chunks(
            all_chunks,
            feature=feature,
            query_terms=query_terms,
            max_chunks=max_total_chunks,
        )
        
        coverage = calculate_section_coverage(cleaned_chunks, sections)
        avg_coverage = sum(coverage.values()) / len(coverage) if coverage else 0.0
        log.append(f"Coverage after Pass 2: {avg_coverage:.2f}")
    
    # Step 7: Sort by book priority
    cleaned_chunks = sort_by_book_priority(cleaned_chunks, feature="drug" if feature in ["drug", "interaction"] else "disease")
    
    # Step 8: Determine final coverage status
    if avg_coverage >= min_coverage_threshold:
        status = CoverageStatus.SUFFICIENT
        fallback_allowed = False
    elif avg_coverage >= min_coverage_threshold * 0.5:
        status = CoverageStatus.INSUFFICIENT_RECOVERABLE
        fallback_allowed = False
    else:
        status = CoverageStatus.INSUFFICIENT_FINAL
        fallback_allowed = True
    
    log.append(f"Final status: {status.value}, fallback_allowed: {fallback_allowed}")
    
    # Convert section coverage to serializable format
    section_scores = {s.value: score for s, score in coverage.items()}
    
    return ResolverResult(
        best_chunks=cleaned_chunks,
        coverage_status=status,
        section_scores=section_scores,
        fallback_allowed=fallback_allowed,
        resolver_log=log,
        total_retrieved=len(all_chunks),
        total_kept=len(cleaned_chunks),
        queries_used=queries_used[:20],  # Limit for debug output
    )


# =============================================================================
# SPECIALIZED RESOLVERS
# =============================================================================

def resolve_treatment_evidence(
    topic: str,
    context: Optional[Dict[str, Any]] = None,
) -> ResolverResult:
    """Resolve evidence specifically for treatment advisor."""
    sections = [
        SectionType.TREATMENT_OF_CHOICE,
        SectionType.FIRST_LINE,
        SectionType.DOSE,
        SectionType.SECOND_LINE,
        SectionType.CONTRAINDICATIONS,
        SectionType.MONITORING,
        SectionType.RED_FLAGS,
    ]
    return resolve_evidence(
        topic=topic,
        feature="treatment",
        sections=sections,
        user_context=context,
        max_total_chunks=35,
        min_coverage_threshold=0.25,
    )


def resolve_ddx_evidence(
    symptoms: List[str],
    context: Optional[Dict[str, Any]] = None,
) -> ResolverResult:
    """Resolve evidence specifically for DDx."""
    topic = " ".join(symptoms)
    sections = [
        SectionType.DIFFERENTIAL,
        SectionType.MUST_NOT_MISS,
        SectionType.WORKUP,
        SectionType.INVESTIGATIONS,
        SectionType.RED_FLAGS,
    ]
    return resolve_evidence(
        topic=topic,
        feature="ddx",
        sections=sections,
        user_context=context,
        max_total_chunks=35,
        min_coverage_threshold=0.20,
    )


def resolve_drug_evidence(
    drug_name: str,
    context: Optional[Dict[str, Any]] = None,
) -> ResolverResult:
    """Resolve evidence specifically for drug details."""
    sections = [
        SectionType.MECHANISM,
        SectionType.INDICATIONS,
        SectionType.DOSE,
        SectionType.ADVERSE_EFFECTS,
        SectionType.CONTRAINDICATIONS,
        SectionType.INTERACTIONS,
        SectionType.BRANDS,
    ]
    return resolve_evidence(
        topic=drug_name,
        feature="drug",
        sections=sections,
        user_context=context,
        max_total_chunks=30,
        min_coverage_threshold=0.25,
    )


def resolve_interaction_evidence(
    drugs: List[str],
    context: Optional[Dict[str, Any]] = None,
) -> ResolverResult:
    """Resolve evidence specifically for drug interactions."""
    topic = " ".join(drugs) + " interaction"
    sections = [
        SectionType.INTERACTIONS,
        SectionType.CONTRAINDICATIONS,
        SectionType.ADVERSE_EFFECTS,
        SectionType.MONITORING,
    ]
    return resolve_evidence(
        topic=topic,
        feature="interaction",
        sections=sections,
        user_context=context,
        max_total_chunks=25,
        min_coverage_threshold=0.20,
    )
