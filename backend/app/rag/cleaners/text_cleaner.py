# backend/app/rag/cleaners/text_cleaner.py
"""
Retrieval-time text cleaner for DDx, Treatment, Drug, and Interaction features.
STRICT anti-garbage filters to remove index pages, cross-references,
figure/table-only content, and other non-clinical noise.
"""
from __future__ import annotations

import hashlib
import re
from typing import Any, Dict, List, Set, Tuple


# =============================================================================
# GARBAGE PATTERNS - Content that should be rejected or cleaned
# =============================================================================

# Patterns that indicate the chunk is garbage (case-insensitive)
GARBAGE_PATTERNS_CI = [
    # Cross-references and index-like content
    r"\bfurther\s+reading\b",
    r"\bsee\s+also\b",
    r"\bsee\s+chapter\b",
    r"\bsee\s+chap\.?\s*\d+",
    r"\bsee\s+p\.?\s*\d+",
    r"\bsee\s+table\b",
    r"\bsee\s+figure\b",
    r"\bchap\.?\s*\d+",
    r"\bchapter\s+\d+\s*$",
    r"\bpart\s+\d+\s*$",
    r"\bsection\s+\d+\s*$",
    
    # Index markers
    r"\bindex\b.*\b\d{3,4}\b",
    r"\b\d{3,4}[tf]\b",  # Page markers like "3412t", "2786f"
    r"\b\d{3,4}–\d{3,4}\b",  # Page ranges like "123-456"
    r"\b\d{3,4}-\d{3,4}\b",  # Page ranges with normal hyphen
    
    # Figure/table captions without content
    r"^figure\s+\d+[\.\-]",
    r"^table\s+\d+[\.\-]",
    r"^fig\.?\s*\d+",
    
    # Index artifact patterns
    r"\bincidence\s+of\s*,",
    r"\bprevalence\s+of\s*,",
    r"\bepidemiolog\w*\s+of\s*,",
    r"\btreatment\s+of\s*,\s*\d",
    r"\bdiagnosis\s+of\s*,\s*\d",
    
    # Page number only
    r"^\s*\d+\s*$",
    
    # Code-like entries
    r"^[A-Z]\d+\s*$",
    
    # Copyright/publisher
    r"\bcopyright\b",
    r"\ball\s+rights\s+reserved\b",
    r"\bisbn\b",
    r"\bprinted\s+in\b",
    r"\bmcgraw[\s\-]?hill\b",
    r"\belsevier\b",
    r"\boxford\s+university\s+press\b",
    
    # Common non-content lines
    r"^\s*contents?\s*$",
    r"^\s*acknowledgment",
    r"^\s*preface\s*$",
    r"^\s*foreword\s*$",
    r"^\s*appendix\s+\d",
    r"^\s*references?\s*$",
    r"^\s*bibliography\s*$",
]

GARBAGE_REGEX_CI = re.compile("|".join(GARBAGE_PATTERNS_CI), re.IGNORECASE | re.MULTILINE)

# Additional patterns that are case-sensitive
GARBAGE_PATTERNS_CS = [
    r"^\s*[A-Z]{1,2}\s*$",  # Single/double capital letters as headers
    r"^\s*[IVX]+\s*$",  # Roman numerals alone
]

GARBAGE_REGEX_CS = re.compile("|".join(GARBAGE_PATTERNS_CS), re.MULTILINE)

# Patterns that indicate high index-like content density
INDEX_INDICATORS = [
    r",\s*\d{3,4}",  # Comma followed by page number
    r"\d{3,4},",  # Page number followed by comma
    r"\b\d{3,4}[,;]\s*\d{3,4}",  # Multiple page numbers
]


# =============================================================================
# CLINICAL BOOST TERMS - Content we prefer
# =============================================================================

DDX_BOOST_TERMS = [
    "differential diagnosis",
    "differential",
    "diagnosis",
    "diagnostic approach",
    "diagnostic criteria",
    "evaluation",
    "workup",
    "assessment",
    "red flags",
    "must not miss",
    "life-threatening",
    "emergency",
    "urgent",
    "clinical features",
    "presentation",
    "signs and symptoms",
    "history",
    "physical examination",
    "investigations",
    "approach to",
    "causes of",
    "etiology",
]

TREATMENT_BOOST_TERMS = [
    "treatment",
    "therapy",
    "management",
    "first-line",
    "first line",
    "treatment of choice",
    "recommended",
    "regimen",
    "dose",
    "dosage",
    "dosing",
    "administration",
    "duration",
    "guideline",
    "evidence-based",
    "GDMT",
    "initial therapy",
    "maintenance",
    "acute management",
    "chronic management",
    "supportive care",
    "adjunct",
    "alternative",
    "second-line",
    "contraindicated",
    "monitoring",
    "follow-up",
    "mg",
    "mcg",
    "units",
]

DRUG_BOOST_TERMS = [
    "mechanism",
    "mechanism of action",
    "pharmacokinetics",
    "pharmacodynamics",
    "absorption",
    "distribution",
    "metabolism",
    "excretion",
    "half-life",
    "bioavailability",
    "indication",
    "contraindication",
    "adverse effect",
    "side effect",
    "drug interaction",
    "dosage",
    "dose adjustment",
    "renal impairment",
    "hepatic impairment",
    "pregnancy",
    "lactation",
    "monitoring",
    "brand",
    "formulation",
    "tablet",
    "capsule",
    "injection",
]

INTERACTION_BOOST_TERMS = [
    "interaction",
    "drug interaction",
    "contraindicated",
    "avoid",
    "caution",
    "severity",
    "mechanism",
    "clinical significance",
    "management",
    "monitoring",
    "alternative",
    "QT prolongation",
    "bleeding",
    "serotonin",
    "nephrotoxicity",
    "hepatotoxicity",
    "CYP450",
    "P-glycoprotein",
]


# =============================================================================
# CLEANING FUNCTIONS
# =============================================================================

def is_garbage_chunk(text: str) -> Tuple[bool, str]:
    """
    Determine if a chunk is garbage and should be rejected.
    
    Returns:
        (is_garbage: bool, reason: str)
    """
    if not text or not text.strip():
        return True, "empty"
    
    t = text.strip()
    
    # Too short to be useful
    if len(t) < 80:
        return True, "too_short"
    
    # Check for garbage patterns (case-insensitive)
    if GARBAGE_REGEX_CI.search(t):
        return True, "garbage_pattern_ci"
    
    # Check for garbage patterns (case-sensitive)
    if GARBAGE_REGEX_CS.search(t):
        return True, "garbage_pattern_cs"
    
    # Check for high index-like density
    sample = t[:600].lower()
    
    # Count commas and digits
    comma_count = sample.count(",")
    digit_count = sum(1 for c in sample if c.isdigit())
    alpha_count = sum(1 for c in sample if c.isalpha())
    
    # High comma density suggests index
    if comma_count >= 12 and len(sample) > 100:
        return True, "high_comma_density"
    
    # High digit density suggests page number list
    if digit_count > 50 and len(sample) > 100:
        # Unless it's likely dosing information
        if "mg" not in sample and "dose" not in sample and "ml" not in sample:
            return True, "high_digit_density"
    
    # Very low alpha ratio suggests non-text content
    if len(sample) > 100 and alpha_count < len(sample) * 0.4:
        return True, "low_alpha_ratio"
    
    # Check for page number patterns
    page_refs = len(re.findall(r"\b\d{3,4}\b", sample))
    if page_refs >= 6:
        return True, "many_page_refs"
    
    # Check for repeated short lines (index-like)
    lines = [ln.strip() for ln in t.split("\n") if ln.strip()]
    if len(lines) > 5:
        short_lines = sum(1 for ln in lines if len(ln) < 25)
        if short_lines / len(lines) > 0.65:
            return True, "many_short_lines"
    
    # Check for comma-separated term lists (index entries)
    # Pattern: "term, 123, 456, term2, 789"
    index_pattern_count = len(re.findall(r"\w+\s*,\s*\d{3,4}", sample))
    if index_pattern_count >= 4:
        return True, "index_entry_pattern"
    
    return False, ""


def clean_chunk_text(text: str) -> str:
    """
    Clean a chunk's text by removing garbage lines while preserving clinical content.
    """
    if not text:
        return ""
    
    lines = text.splitlines()
    cleaned = []
    
    for line in lines:
        ln = line.strip()
        
        # Skip empty lines (but preserve paragraph breaks)
        if not ln:
            if cleaned and cleaned[-1] != "":
                cleaned.append("")
            continue
        
        # Skip lines matching garbage patterns
        if GARBAGE_REGEX_CI.search(ln):
            continue
        
        if GARBAGE_REGEX_CS.search(ln):
            continue
        
        # Skip very short lines that look like headers/footers
        if len(ln) < 4:
            continue
        
        # Skip page number only lines
        if re.match(r"^\d{1,4}$", ln):
            continue
        
        # Skip lines that are mostly page references
        page_refs = len(re.findall(r"\b\d{3,4}\b", ln))
        if page_refs >= 3 and len(ln) < 80:
            continue
        
        # Skip index-like lines: "term, 123, 456"
        if re.match(r"^[\w\s]+,\s*\d{3,4}(?:,\s*\d{3,4})*\s*$", ln):
            continue
        
        cleaned.append(line)
    
    # Normalize whitespace
    result = "\n".join(cleaned)
    result = re.sub(r"\n{3,}", "\n\n", result)
    result = re.sub(r"[ \t]+", " ", result)
    
    return result.strip()


def compute_content_hash(text: str) -> str:
    """
    Compute a stable hash for content de-duplication.
    Normalizes text before hashing to catch near-duplicates.
    """
    # Normalize: lowercase, collapse whitespace, remove punctuation
    normalized = text.lower()
    normalized = re.sub(r"\s+", " ", normalized)
    normalized = re.sub(r"[^\w\s]", "", normalized)
    normalized = normalized.strip()[:500]  # First 500 chars
    
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def dedupe_chunks_by_content(chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Remove duplicate chunks based on content similarity.
    """
    seen_hashes: Set[str] = set()
    deduped: List[Dict[str, Any]] = []
    
    for chunk in chunks:
        text = chunk.get("text") or ""
        if not text.strip():
            continue
        
        content_hash = compute_content_hash(text)
        if content_hash in seen_hashes:
            continue
        
        seen_hashes.add(content_hash)
        chunk["content_hash"] = content_hash
        deduped.append(chunk)
    
    return deduped


def compute_relevance_score(
    text: str,
    feature: str,  # "ddx" | "treatment" | "drug" | "interaction"
    query_terms: List[str] = None,
) -> float:
    """
    Compute a relevance score for reranking.
    Higher score = more relevant.
    
    Factors:
    - Presence of clinical boost terms
    - Query term overlap
    - Text quality signals
    """
    if not text:
        return 0.0
    
    t = text.lower()
    score = 0.0
    
    # Select boost terms based on feature
    if feature == "ddx":
        boost_terms = DDX_BOOST_TERMS
    elif feature == "treatment":
        boost_terms = TREATMENT_BOOST_TERMS
    elif feature == "drug":
        boost_terms = DRUG_BOOST_TERMS
    elif feature == "interaction":
        boost_terms = INTERACTION_BOOST_TERMS
    else:
        boost_terms = DDX_BOOST_TERMS + TREATMENT_BOOST_TERMS
    
    # Count boost term matches
    for term in boost_terms:
        if term.lower() in t:
            score += 2.0
    
    # Query term overlap (higher weight)
    if query_terms:
        for qt in query_terms:
            qt_lower = qt.lower()
            if len(qt_lower) >= 3 and qt_lower in t:
                score += 2.5
    
    # Length bonus (longer chunks often have more information)
    text_len = len(text)
    if text_len > 400:
        score += 1.0
    if text_len > 800:
        score += 0.5
    if text_len > 1200:
        score += 0.5
    
    # Penalty for garbage-like content that wasn't rejected
    if re.search(r"\bsee\s+also\b", t, re.IGNORECASE):
        score -= 3.0
    if re.search(r"\bfurther\s+reading\b", t, re.IGNORECASE):
        score -= 3.0
    if re.search(r"\bindex\b", t, re.IGNORECASE):
        score -= 2.0
    
    # Penalty for high page number density
    page_refs = len(re.findall(r"\b\d{3,4}\b", t[:500]))
    if page_refs >= 4:
        score -= 2.0
    
    return max(0.0, score)


def filter_and_clean_chunks(
    chunks: List[Dict[str, Any]],
    feature: str,
    query_terms: List[str] = None,
    max_chunks: int = 30,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Main entry point: filter, clean, dedupe, and rerank chunks.
    
    Args:
        chunks: Raw chunks from retrieval
        feature: "ddx" | "treatment" | "drug" | "interaction"
        query_terms: Terms from the user query for relevance scoring
        max_chunks: Maximum chunks to return
    
    Returns:
        (kept_chunks, dropped_chunks)
    """
    kept: List[Dict[str, Any]] = []
    dropped: List[Dict[str, Any]] = []
    
    for chunk in chunks:
        text = chunk.get("text") or ""
        
        # Check if garbage
        is_garbage, reason = is_garbage_chunk(text)
        if is_garbage:
            dropped.append({"chunk": chunk, "reason": reason})
            continue
        
        # Clean the text
        cleaned_text = clean_chunk_text(text)
        if len(cleaned_text) < 60:
            dropped.append({"chunk": chunk, "reason": "cleaned_too_short"})
            continue
        
        # Compute relevance score
        score = compute_relevance_score(cleaned_text, feature, query_terms)
        
        # Create cleaned chunk
        cleaned_chunk = {
            **chunk,
            "text": cleaned_text,
            "original_text": text,
            "relevance_score": score,
            "content_hash": compute_content_hash(cleaned_text),
        }
        kept.append(cleaned_chunk)
    
    # Dedupe by content
    kept = dedupe_chunks_by_content(kept)
    
    # Sort by relevance score (highest first)
    kept.sort(key=lambda c: c.get("relevance_score", 0), reverse=True)
    
    # Limit to max_chunks
    if len(kept) > max_chunks:
        dropped.extend([{"chunk": c, "reason": "over_limit"} for c in kept[max_chunks:]])
        kept = kept[:max_chunks]
    
    return kept, dropped


# =============================================================================
# BOOK PRIORITY
# =============================================================================

BOOK_PRIORITY_MAP = {
    # Clinical textbooks (highest priority for disease content)
    "harrison": 1,
    "medicine_harrison": 1,
    "oxford_clinical_medicine": 2,
    "oxford_medicine": 2,
    "oxford": 3,
    "surgery_oxford": 3,
    "oxford_surgery": 3,
    "pediatrics_oxford": 4,
    "oxford_pediatrics": 4,
    "obgyn_dutta": 5,
    "dutta": 5,
    
    # Drug books (primary for drug/dosing content)
    "kd_tripathi": 6,
    "tripathi": 6,
    "drugs_mims_kd": 7,
    "mims": 7,
}

# For drug features, reverse priority
DRUG_BOOK_PRIORITY_MAP = {
    "drugs_mims_kd": 1,
    "mims": 1,
    "kd_tripathi": 2,
    "tripathi": 2,
    "harrison": 5,
    "medicine_harrison": 5,
    "oxford": 6,
}


def get_book_priority(book_id: str, collection: str, feature: str = "disease") -> int:
    """
    Get priority for a book (lower = higher priority).
    
    Args:
        book_id: Book identifier
        collection: Collection name
        feature: "disease" (DDx/Treatment) or "drug" (Drug Details/Interactions)
    """
    book_lower = (book_id or "").lower()
    col_lower = (collection or "").lower()
    
    priority_map = DRUG_BOOK_PRIORITY_MAP if feature == "drug" else BOOK_PRIORITY_MAP
    
    for key, priority in priority_map.items():
        if key in book_lower or key in col_lower:
            return priority
    
    return 99  # Unknown book


def sort_by_book_priority(
    chunks: List[Dict[str, Any]],
    feature: str = "disease",
) -> List[Dict[str, Any]]:
    """
    Sort chunks by book priority.
    
    Args:
        chunks: List of chunks
        feature: "disease" (Harrison first) or "drug" (MIMS/Tripathi first)
    """
    def priority_key(chunk):
        book = chunk.get("book_id") or chunk.get("book") or ""
        collection = chunk.get("collection") or ""
        return (
            get_book_priority(book, collection, feature),
            -(chunk.get("relevance_score") or 0),
        )
    
    return sorted(chunks, key=priority_key)


# =============================================================================
# VALIDATION HELPERS
# =============================================================================

BANNED_GARBAGE_PATTERNS = [
    r"\bfurther\s+reading\b",
    r"\bsee\s+also\b",
    r"\bchap\.\s*\d+",
    r"\bindex\b",
    r"\b\d{3,4}[tf]\b",
    r",\s*\d{3,4},\s*\d{3,4}",
]

BANNED_REGEX = re.compile("|".join(BANNED_GARBAGE_PATTERNS), re.IGNORECASE)


def contains_banned_garbage(text: str) -> bool:
    """
    Check if text contains banned garbage patterns.
    Used for testing and validation.
    """
    return bool(BANNED_REGEX.search(text or ""))


def validate_clean_output(response_text: str) -> Tuple[bool, List[str]]:
    """
    Validate that a response doesn't contain garbage patterns.
    
    Returns:
        (is_valid, list_of_violations)
    """
    violations = []
    
    for pattern in BANNED_GARBAGE_PATTERNS:
        matches = re.findall(pattern, response_text, re.IGNORECASE)
        if matches:
            violations.extend(matches)
    
    return len(violations) == 0, violations
