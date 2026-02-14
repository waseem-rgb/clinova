# backend/app/rag/extractors/drug_details_extractor.py
"""
DOCTOR-GRADE Drug Details Extractor
Evidence-first with labeled LLM fallback for completeness guarantee.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from openai import OpenAI

from app.rag.resolver import (
    resolve_drug_evidence,
    CoverageStatus,
    ResolverResult,
)
from app.rag.extractors.base import (
    SourceLabel,
    DualModeResponseBase,
    generate_fallback_content,
    extract_doses_from_text,
    validate_dose_reasonableness,
)


# =============================================================================
# CONFIG
# =============================================================================

LLM_MODEL = os.getenv("OPENAI_CHAT_MODEL", "gpt-4.1")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


def _get_llm() -> OpenAI:
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not set")
    return OpenAI(api_key=OPENAI_API_KEY)


# =============================================================================
# ESSENTIAL DRUG SECTIONS (must always have content)
# =============================================================================

ESSENTIAL_SECTIONS = [
    "indications",
    "dosing",
    "contraindications",
    "adverse_effects",
]

NICE_TO_HAVE_SECTIONS = [
    "mechanism_of_action",
    "renal_adjustment",
    "hepatic_adjustment",
    "monitoring",
    "pregnancy_lactation",
    "counselling",
    "formulations",
    "brands",
]


# =============================================================================
# RAG EXTRACTION PROMPT (evidence-only)
# =============================================================================

DRUG_DETAILS_SYSTEM_PROMPT = """You are a clinical pharmacology extraction system.
Your task is to extract structured drug information from medical textbook evidence.

CRITICAL RULES:
1. ONLY use information from the provided evidence chunks. DO NOT invent or add outside knowledge.
2. If evidence is insufficient for a field, return empty array or "Not found in sources".
3. Extract EXACT dosing numbers (mg, mcg, units) when present in evidence.
4. Brand names should ONLY come from MIMS/Tripathi evidence, never invented.
5. Include renal/hepatic adjustments only if explicitly mentioned in evidence.
6. Format output as strict JSON matching the schema exactly."""

DRUG_DETAILS_USER_PROMPT_TEMPLATE = """DRUG: {drug_name}
PATIENT CONTEXT:
- Age: {age}
- Pregnancy: {pregnancy}
- Renal status: {renal_status}
- Hepatic status: {hepatic_status}

EVIDENCE CHUNKS (from medical textbooks):
{evidence_text}

Extract drug details from ONLY the evidence above. Return strict JSON:
{{
  "drug": {{
    "generic_name": "drug name",
    "class": "drug class if found",
    "aliases": ["other names if found"]
  }},
  "indications": ["indication 1", "indication 2"],
  "dosing": {{
    "adult_table": [
      {{
        "indication": "for what",
        "dose": "e.g., 500mg",
        "route": "PO/IV/IM",
        "frequency": "e.g., BD, TDS",
        "duration": "if specified",
        "notes": "any important notes"
      }}
    ],
    "pediatric_table": [
      {{
        "indication": "for what",
        "dose": "weight-based dose",
        "route": "route",
        "frequency": "frequency",
        "notes": "age restrictions etc"
      }}
    ]
  }},
  "renal_adjustment": ["adjustment 1 if found"],
  "hepatic_adjustment": ["adjustment 1 if found"],
  "contraindications": ["contraindication 1", "contraindication 2"],
  "adverse_effects": {{
    "common": ["common effect 1", "common effect 2"],
    "serious": ["serious effect 1"]
  }},
  "monitoring": ["what to monitor 1", "what to monitor 2"],
  "pregnancy_lactation": ["pregnancy category/notes", "lactation notes"],
  "counselling": ["patient counselling point 1"],
  "formulations": ["available forms: tablet 500mg, injection 1g/vial"],
  "brands_india": [
    {{
      "brand": "Brand Name",
      "strength": "500mg",
      "form": "tablet",
      "company": "if found",
      "price": "if found"
    }}
  ],
  "evidence_chunk_ids": ["list of chunk IDs used"]
}}

If a section has no evidence, use empty arrays."""


# =============================================================================
# FALLBACK PROMPT (when RAG insufficient - clearly labeled)
# =============================================================================

FALLBACK_SYSTEM_PROMPT = """You are a clinical pharmacology assistant.
The user needs drug information that was not found in their medical textbooks.

CRITICAL: All information you provide will be labeled as "LLM-GUIDED (VERIFY LOCALLY)"
because it is NOT from their indexed evidence. The doctor MUST verify this information.

Provide commonly accepted pharmacological information for the drug, including:
- Primary indications
- Standard dosing (with clear VERIFY DOSE markers)
- Key contraindications
- Common and serious adverse effects
- Monitoring requirements

Be conservative and clinically accurate. Include standard references where applicable."""


# =============================================================================
# MAIN EXTRACTION FUNCTION
# =============================================================================

def extract_drug_details_from_chunks(
    *,
    drug_name: str,
    age: Optional[int] = None,
    pregnancy: Optional[str] = None,
    renal_status: Optional[str] = None,
    hepatic_status: Optional[str] = None,
    chunks: List[Dict[str, Any]],
    debug: bool = False,
) -> Dict[str, Any]:
    """
    Extract structured drug details with evidence-first approach.
    
    Uses Evidence Gap Resolver for multi-pass retrieval, then falls back
    to LLM-guided content (clearly labeled) only if essential sections missing.
    
    Returns dual-mode response with source labels for every item.
    """
    # =======================================================================
    # STEP 1: Use Evidence Gap Resolver for enhanced retrieval
    # =======================================================================
    context = {
        "age": age,
        "pregnancy": pregnancy,
        "renal_status": renal_status,
        "hepatic_status": hepatic_status,
    }
    
    resolver_result = resolve_drug_evidence(
        drug_name=drug_name,
        context=context,
    )
    
    # =======================================================================
    # STEP 2: Extract evidence-based content from resolved chunks
    # =======================================================================
    evidence_based = _extract_from_rag(
        drug_name=drug_name,
        chunks=resolver_result.best_chunks,
        context=context,
    )
    
    # =======================================================================
    # STEP 3: Check if fallback needed (essential sections missing)
    # =======================================================================
    fallback_needed = _needs_fallback(evidence_based, resolver_result)
    
    llm_guided = None
    if fallback_needed:
        llm_guided = _generate_drug_fallback(
            drug_name=drug_name,
            context=context,
            evidence_based=evidence_based,
        )
    
    # =======================================================================
    # STEP 4: Build complete dual-mode response
    # =======================================================================
    result = _build_dual_mode_response(
        drug_name=drug_name,
        evidence_based=evidence_based,
        llm_guided=llm_guided,
        resolver_result=resolver_result,
        chunks=resolver_result.best_chunks,
    )
    
    if debug:
        result["debug"] = {
            "llm_model": LLM_MODEL,
            "resolver_coverage": resolver_result.coverage_status.value,
            "section_scores": resolver_result.section_scores,
            "fallback_triggered": fallback_needed,
            "evidence_chunk_count": len(resolver_result.best_chunks),
        }
    
    return result


def _extract_from_rag(
    drug_name: str,
    chunks: List[Dict[str, Any]],
    context: Dict[str, Any],
) -> Dict[str, Any]:
    """Extract drug details from RAG chunks only."""
    if not chunks:
        return {"empty": True}
    
    # Build evidence text
    evidence_blocks = []
    for i, chunk in enumerate(chunks[:20]):
        chunk_id = chunk.get("chunk_id") or f"chunk_{i}"
        text = chunk.get("text") or ""
        book = chunk.get("book") or chunk.get("book_id") or "Unknown"
        page = chunk.get("page_start") or ""
        collection = chunk.get("collection") or ""
        
        source_type = "Drug Book" if any(k in collection.lower() for k in ["mims", "tripathi", "drug"]) else "Clinical Textbook"
        evidence_blocks.append(
            f"[CHUNK {chunk_id}] (Source: {book}, {source_type}, p{page})\n{text[:1800]}"
        )
    
    evidence_text = "\n\n---\n\n".join(evidence_blocks)
    
    user_prompt = DRUG_DETAILS_USER_PROMPT_TEMPLATE.format(
        drug_name=drug_name,
        age=context.get("age") or "Not specified",
        pregnancy=context.get("pregnancy") or "Not specified",
        renal_status=context.get("renal_status") or "Not specified",
        hepatic_status=context.get("hepatic_status") or "Not specified",
        evidence_text=evidence_text,
    )
    
    try:
        llm = _get_llm()
        resp = llm.chat.completions.create(
            model=LLM_MODEL,
            temperature=0.1,
            messages=[
                {"role": "system", "content": DRUG_DETAILS_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        )
        llm_raw = resp.choices[0].message.content or ""
        
        json_match = re.search(r"\{[\s\S]*\}", llm_raw)
        if json_match:
            return json.loads(json_match.group())
    except Exception as e:
        return {"error": str(e)}
    
    return {"empty": True}


def _needs_fallback(
    evidence_based: Dict[str, Any],
    resolver_result: ResolverResult,
) -> bool:
    """Check if LLM fallback is needed for completeness."""
    # Always fallback if resolver says insufficient
    if resolver_result.coverage_status in [
        CoverageStatus.INSUFFICIENT_RECOVERABLE,
        CoverageStatus.INSUFFICIENT_FINAL,
    ]:
        return resolver_result.fallback_allowed
    
    if evidence_based.get("error") or evidence_based.get("empty"):
        return True
    
    # Check essential sections
    indications = evidence_based.get("indications") or []
    dosing = evidence_based.get("dosing") or {}
    adult_table = dosing.get("adult_table") or []
    contraindications = evidence_based.get("contraindications") or []
    
    # If no indications or no dosing, fallback needed
    if not indications and not adult_table:
        return True
    
    return False


def _generate_drug_fallback(
    drug_name: str,
    context: Dict[str, Any],
    evidence_based: Dict[str, Any],
) -> Dict[str, Any]:
    """Generate LLM-guided fallback content."""
    prompt = f"""Drug: {drug_name}
Patient context: {json.dumps(context)}

Evidence-based findings (keep these, fill gaps only):
- Indications found: {len(evidence_based.get('indications') or [])}
- Dosing rows found: {len((evidence_based.get('dosing') or {}).get('adult_table') or [])}
- Contraindications found: {len(evidence_based.get('contraindications') or [])}

Provide comprehensive drug information for sections with insufficient evidence.
Include VERIFY DOSE warning on all dosing information.

Return JSON with same schema as drug details."""

    try:
        llm = _get_llm()
        resp = llm.chat.completions.create(
            model=LLM_MODEL,
            temperature=0.2,
            messages=[
                {"role": "system", "content": FALLBACK_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        )
        llm_raw = resp.choices[0].message.content or ""
        
        json_match = re.search(r"\{[\s\S]*\}", llm_raw)
        if json_match:
            result = json.loads(json_match.group())
            # Add VERIFY DOSE warnings to all dosing
            _add_verify_warnings(result)
            return result
    except Exception:
        pass
    
    # Minimal fallback
    return {
        "indications": [f"LLM-GUIDED: {drug_name} - verify indications locally"],
        "dosing": {
            "adult_table": [{
                "indication": "Standard dosing",
                "dose": "VERIFY DOSE LOCALLY",
                "route": "As prescribed",
                "frequency": "Per local guidelines",
                "notes": "LLM-generated - verify before prescribing",
            }],
        },
        "contraindications": ["Verify contraindications with local formulary"],
        "adverse_effects": {
            "common": ["Verify with local drug reference"],
            "serious": ["Verify with local drug reference"],
        },
    }


def _add_verify_warnings(result: Dict[str, Any]) -> None:
    """Add VERIFY DOSE warnings to LLM-generated dosing."""
    dosing = result.get("dosing") or {}
    
    for table_key in ["adult_table", "pediatric_table"]:
        table = dosing.get(table_key) or []
        for row in table:
            dose = row.get("dose") or ""
            if dose and "VERIFY" not in dose.upper():
                row["dose"] = f"VERIFY: {dose}"
            row["notes"] = row.get("notes", "") + " [LLM-GUIDED - verify locally]"


def _build_dual_mode_response(
    drug_name: str,
    evidence_based: Dict[str, Any],
    llm_guided: Optional[Dict[str, Any]],
    resolver_result: ResolverResult,
    chunks: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Build complete dual-mode response with source labels."""
    
    # Merge evidence_based and llm_guided, preferring evidence
    merged = _merge_drug_data(evidence_based, llm_guided)
    
    # Extract components
    drug_info = merged.get("drug") or {}
    generic_name = drug_info.get("generic_name") or drug_name
    drug_class = drug_info.get("class") or ""
    
    indications = merged.get("indications") or []
    dosing = merged.get("dosing") or {}
    adult_table = dosing.get("adult_table") or []
    pediatric_table = dosing.get("pediatric_table") or []
    
    renal_adjustment = merged.get("renal_adjustment") or []
    hepatic_adjustment = merged.get("hepatic_adjustment") or []
    contraindications = merged.get("contraindications") or []
    adverse_effects = merged.get("adverse_effects") or {}
    monitoring = merged.get("monitoring") or []
    pregnancy_lactation = merged.get("pregnancy_lactation") or []
    counselling = merged.get("counselling") or []
    formulations = merged.get("formulations") or []
    brands_india = merged.get("brands_india") or []
    
    # Build source labels for each section
    source_labels = _compute_source_labels(evidence_based, llm_guided)
    
    # Header
    header = {
        "canonical_generic_name": generic_name,
        "common_brand_names": [b.get("brand") for b in brands_india if b.get("brand")][:8],
        "drug_class": drug_class,
        "quick_flags": _extract_quick_flags(contraindications, pregnancy_lactation, renal_adjustment),
        "source_label": source_labels.get("header", SourceLabel.EVIDENCE_BASED.value),
    }
    
    # Executive summary cards
    executive_summary_cards = [
        {
            "title": "Primary Indication",
            "value": indications[0] if indications else "See indications section",
            "source_label": source_labels.get("indications", SourceLabel.EVIDENCE_BASED.value),
        },
        {
            "title": "Mechanism/Class",
            "value": drug_class if drug_class else "Not found in sources",
            "source_label": source_labels.get("mechanism", SourceLabel.EVIDENCE_BASED.value),
        },
        {
            "title": "Key Safety",
            "value": contraindications[0] if contraindications else "See contraindications",
            "source_label": source_labels.get("contraindications", SourceLabel.EVIDENCE_BASED.value),
        },
        {
            "title": "Common Adverse Effects",
            "value": ", ".join((adverse_effects.get("common") or [])[:3]) or "See adverse effects",
            "source_label": source_labels.get("adverse_effects", SourceLabel.EVIDENCE_BASED.value),
        },
    ]
    
    # Sections with source labels
    sections = [
        {
            "key": "indications",
            "title": "Indications",
            "bullets": indications or ["Not found in sources"],
            "source_label": source_labels.get("indications", SourceLabel.EVIDENCE_BASED.value),
            "citations": [],
        },
        {
            "key": "mechanism_of_action",
            "title": "Mechanism of Action",
            "bullets": [drug_class] if drug_class else ["Not found in sources"],
            "source_label": source_labels.get("mechanism", SourceLabel.EVIDENCE_BASED.value),
            "citations": [],
        },
        {
            "key": "dosing_and_administration",
            "title": "Dosing and Administration",
            "bullets": _format_dosing_bullets(adult_table),
            "source_label": source_labels.get("dosing", SourceLabel.EVIDENCE_BASED.value),
            "dose_warning": source_labels.get("dosing") == SourceLabel.LLM_GUIDED.value,
            "citations": [],
        },
        {
            "key": "pediatric_dosing",
            "title": "Pediatric Dosing",
            "bullets": _format_dosing_bullets(pediatric_table) or ["Not found in sources"],
            "source_label": source_labels.get("pediatric_dosing", SourceLabel.EVIDENCE_BASED.value),
            "dose_warning": source_labels.get("pediatric_dosing") == SourceLabel.LLM_GUIDED.value,
            "citations": [],
        },
        {
            "key": "renal_adjustment",
            "title": "Renal Dosing Adjustments",
            "bullets": renal_adjustment or ["Not found in sources"],
            "source_label": source_labels.get("renal_adjustment", SourceLabel.EVIDENCE_BASED.value),
            "citations": [],
        },
        {
            "key": "hepatic_adjustment",
            "title": "Hepatic Impairment Adjustments",
            "bullets": hepatic_adjustment or ["Not found in sources"],
            "source_label": source_labels.get("hepatic_adjustment", SourceLabel.EVIDENCE_BASED.value),
            "citations": [],
        },
        {
            "key": "contraindications",
            "title": "Contraindications",
            "bullets": contraindications or ["Not found in sources"],
            "source_label": source_labels.get("contraindications", SourceLabel.EVIDENCE_BASED.value),
            "citations": [],
        },
        {
            "key": "adverse_effects",
            "title": "Adverse Effects",
            "bullets": [
                f"Common: {', '.join(adverse_effects.get('common') or [])}",
                f"Serious: {', '.join(adverse_effects.get('serious') or [])}",
            ] if adverse_effects.get("common") or adverse_effects.get("serious") else ["Not found in sources"],
            "source_label": source_labels.get("adverse_effects", SourceLabel.EVIDENCE_BASED.value),
            "citations": [],
        },
        {
            "key": "monitoring",
            "title": "Monitoring",
            "bullets": monitoring or ["Not found in sources"],
            "source_label": source_labels.get("monitoring", SourceLabel.EVIDENCE_BASED.value),
            "citations": [],
        },
        {
            "key": "use_in_pregnancy_lactation",
            "title": "Pregnancy & Lactation",
            "bullets": pregnancy_lactation or ["Not found in sources"],
            "source_label": source_labels.get("pregnancy_lactation", SourceLabel.EVIDENCE_BASED.value),
            "citations": [],
        },
        {
            "key": "patient_counseling_points",
            "title": "Patient Counselling",
            "bullets": counselling or ["Not found in sources"],
            "source_label": source_labels.get("counselling", SourceLabel.EVIDENCE_BASED.value),
            "citations": [],
        },
        {
            "key": "formulations",
            "title": "Formulations",
            "bullets": formulations or ["Not found in sources"],
            "source_label": source_labels.get("formulations", SourceLabel.EVIDENCE_BASED.value),
            "citations": [],
        },
    ]
    
    # Brands and prices
    brands_and_prices = {
        "rows": [
            {
                "brand": b.get("brand") or "",
                "strength": b.get("strength") or "",
                "form": b.get("form") or "",
                "pack": "",
                "price": b.get("price") or "",
                "manufacturer": b.get("company") or "",
                "source": "MIMS/Tripathi",
            }
            for b in brands_india
        ],
        "source_label": SourceLabel.EVIDENCE_BASED.value,
        "citations": [],
    }
    
    # Evidence
    evidence = [
        {
            "chunk_id": ch.get("chunk_id") or ch.get("content_hash") or "",
            "book": ch.get("book") or ch.get("book_id"),
            "chapter": ch.get("chapter") or ch.get("section_path"),
            "page_start": ch.get("page_start"),
            "page_end": ch.get("page_end"),
            "snippet": (ch.get("text") or "")[:400],
        }
        for ch in chunks[:20]
    ]
    
    # Coverage gate
    has_evidence_content = bool(evidence_based.get("indications")) or bool(
        (evidence_based.get("dosing") or {}).get("adult_table")
    )
    has_any_content = bool(indications) or bool(adult_table)
    
    coverage_gate = {
        "passed": has_any_content,
        "evidence_coverage": resolver_result.coverage_status.value,
        "fallback_used": llm_guided is not None,
        "missing_chunk_ids": [] if has_any_content else ["no_content_extracted"],
    }
    
    # LLM guided warning if fallback was used
    llm_guided_warning = None
    if llm_guided:
        llm_guided_warning = (
            "NOTICE: SOME CONTENT IS LLM-GUIDED: Sections marked 'LLM-GUIDED (VERIFY LOCALLY)' "
            "are not from your indexed textbooks. Verify dosing and clinical details with "
            "local formulary or drug references before prescribing."
        )
    
    return {
        "header": header,
        "executive_summary_cards": executive_summary_cards,
        "sections": sections,
        "brands_and_prices": brands_and_prices,
        "evidence": evidence,
        "coverage_gate": coverage_gate,
        "source_labels": source_labels,
        "llm_guided_warning": llm_guided_warning,
    }


def _merge_drug_data(
    evidence_based: Dict[str, Any],
    llm_guided: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Merge evidence-based and LLM-guided data, preferring evidence."""
    if not llm_guided:
        return evidence_based
    
    if evidence_based.get("error") or evidence_based.get("empty"):
        return llm_guided
    
    merged = dict(evidence_based)
    
    # Fill gaps only
    for key in ["indications", "contraindications", "monitoring", "counselling", 
                "renal_adjustment", "hepatic_adjustment", "pregnancy_lactation", "formulations"]:
        if not merged.get(key) and llm_guided.get(key):
            merged[key] = llm_guided[key]
    
    # Dosing: only fill if completely empty
    if not (merged.get("dosing") or {}).get("adult_table"):
        merged["dosing"] = llm_guided.get("dosing") or merged.get("dosing") or {}
    
    # Adverse effects: merge if evidence has gaps
    ev_adr = merged.get("adverse_effects") or {}
    llm_adr = llm_guided.get("adverse_effects") or {}
    if not ev_adr.get("common") and llm_adr.get("common"):
        merged.setdefault("adverse_effects", {})["common"] = llm_adr["common"]
    if not ev_adr.get("serious") and llm_adr.get("serious"):
        merged.setdefault("adverse_effects", {})["serious"] = llm_adr["serious"]
    
    return merged


def _compute_source_labels(
    evidence_based: Dict[str, Any],
    llm_guided: Optional[Dict[str, Any]],
) -> Dict[str, str]:
    """Compute source labels for each section."""
    labels = {}
    
    def has_evidence_content(key: str) -> bool:
        val = evidence_based.get(key)
        if isinstance(val, list):
            return bool(val)
        if isinstance(val, dict):
            return any(v for v in val.values() if v)
        return bool(val)
    
    sections = [
        "indications", "contraindications", "monitoring", "counselling",
        "renal_adjustment", "hepatic_adjustment", "pregnancy_lactation",
        "formulations", "adverse_effects", "mechanism",
    ]
    
    for section in sections:
        if has_evidence_content(section):
            labels[section] = SourceLabel.EVIDENCE_BASED.value
        elif llm_guided and llm_guided.get(section):
            labels[section] = SourceLabel.LLM_GUIDED.value
        else:
            labels[section] = SourceLabel.EVIDENCE_BASED.value  # "Not found" is still from evidence check
    
    # Dosing
    ev_dosing = (evidence_based.get("dosing") or {}).get("adult_table") or []
    if ev_dosing:
        labels["dosing"] = SourceLabel.EVIDENCE_BASED.value
    elif llm_guided and (llm_guided.get("dosing") or {}).get("adult_table"):
        labels["dosing"] = SourceLabel.LLM_GUIDED.value
    else:
        labels["dosing"] = SourceLabel.EVIDENCE_BASED.value
    
    # Pediatric
    ev_ped = (evidence_based.get("dosing") or {}).get("pediatric_table") or []
    if ev_ped:
        labels["pediatric_dosing"] = SourceLabel.EVIDENCE_BASED.value
    elif llm_guided and (llm_guided.get("dosing") or {}).get("pediatric_table"):
        labels["pediatric_dosing"] = SourceLabel.LLM_GUIDED.value
    else:
        labels["pediatric_dosing"] = SourceLabel.EVIDENCE_BASED.value
    
    # Header label
    labels["header"] = SourceLabel.EVIDENCE_BASED.value
    
    return labels


def _extract_quick_flags(
    contraindications: List[str],
    pregnancy_lactation: List[str],
    renal_adjustment: List[str],
) -> List[str]:
    """Extract quick flags from drug information."""
    flags = []
    
    contra_text = " ".join(contraindications).lower()
    preg_text = " ".join(pregnancy_lactation).lower()
    renal_text = " ".join(renal_adjustment).lower()
    
    if any(k in preg_text for k in ["contraindicated", "avoid", "category x", "category d"]):
        flags.append("Pregnancy caution")
    
    if renal_adjustment and "not found" not in renal_text:
        flags.append("Renal adjustment needed")
    
    if any(k in contra_text for k in ["hepatic", "liver"]):
        flags.append("Hepatic caution")
    
    if any(k in contra_text for k in ["black box", "boxed warning", "fatal", "death"]):
        flags.append("Critical warning")
    
    return list(dict.fromkeys(flags))


def _format_dosing_bullets(dosing_table: List[Dict[str, Any]]) -> List[str]:
    """Format dosing table entries as bullet points."""
    bullets = []
    for row in dosing_table:
        indication = row.get("indication") or ""
        dose = row.get("dose") or ""
        route = row.get("route") or ""
        frequency = row.get("frequency") or ""
        duration = row.get("duration") or ""
        notes = row.get("notes") or ""
        
        parts = []
        if indication:
            parts.append(f"For {indication}:")
        if dose:
            parts.append(dose)
        if route:
            parts.append(route)
        if frequency:
            parts.append(frequency)
        if duration:
            parts.append(f"for {duration}")
        if notes:
            parts.append(f"({notes})")
        
        if parts:
            bullets.append(" ".join(parts))
    
    return bullets or ["Not found in sources"]
