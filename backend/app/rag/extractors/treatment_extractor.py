# backend/app/rag/extractors/treatment_extractor.py
"""
DOCTOR-GRADE Treatment Advisor Extractor.

This module implements the COMPLETENESS GUARANTEE:
- RAG is tried exhaustively first via Evidence Gap Resolver
- If evidence is insufficient, LLM fallback is used with CLEAR LABELS
- NEVER show "insufficient evidence" as a dead end
- ALWAYS render complete, clinically useful output

Every response contains:
- evidence_based: Content from RAG sources only
- llm_guided: Fallback content when evidence insufficient
- coverage: Section scores and fallback status
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional

from openai import OpenAI

from app.rag.resolver import (
    CoverageStatus,
    SectionType,
    resolve_treatment_evidence,
)
from app.rag.extractors.base import (
    SourceLabel,
    generate_fallback_content,
    extract_doses_from_text,
    strip_citations_from_text,
    get_llm,
)


# =============================================================================
# CONFIG
# =============================================================================

LLM_MODEL = os.getenv("OPENAI_CHAT_MODEL", "gpt-4.1")


# =============================================================================
# LLM PROMPTS - RAG EXTRACTION (STRICT, NO INVENTION)
# =============================================================================

TREATMENT_RAG_SYSTEM_PROMPT = """You are a clinical decision support system for doctors.
Your task is to extract a COMPLETE, STRUCTURED treatment plan from medical textbook evidence.

CRITICAL RULES - NON-NEGOTIABLE:
1. ONLY use information from the provided evidence chunks
2. DO NOT invent, assume, or add outside medical knowledge
3. EXTRACT ALL DOSES when present in evidence (mg, mcg, g, units)
4. If a specific field is not in evidence, use empty array/null - do not invent
5. Format output as strict JSON matching the schema exactly
6. For each drug, extract: generic name, dose, route, frequency, duration
7. Mark evidence_chunk_ids for traceability
8. If "treatment of choice" is mentioned, highlight it in label

EXTRACTION PRIORITIES:
- Treatment of choice / first-line therapy
- Specific drug names with doses
- Routes and frequencies
- Duration of treatment
- Contraindications
- Monitoring requirements
- Red flags for escalation"""

TREATMENT_RAG_USER_PROMPT = """CLINICAL CONTEXT:
- Condition/Topic: {topic}
- Age: {age}
- Sex: {sex}
- Pregnancy status: {pregnancy}
- Severity: {severity}
- Setting: {setting}
- Comorbidities: {comorbidities}
- Allergies: {allergies}
- Renal status: {renal_status}
- Hepatic status: {hepatic_status}
- Current medications: {current_meds}

EVIDENCE CHUNKS (from medical textbooks - ONLY use these):
{evidence_text}

Extract a treatment plan from ONLY the evidence above. Return strict JSON:
{{
  "summary_plan": ["Treatment goal 1", "Treatment goal 2"],
  "treatment_of_choice": {{
    "name": "drug name or regimen if explicitly stated as treatment of choice",
    "evidence_chunk_id": "chunk_id"
  }},
  "first_line_regimens": [
    {{
      "label": "Regimen description (e.g., 'Treatment of choice for CAP')",
      "indication_notes": "When to use this regimen",
      "drugs": [
        {{
          "generic": "drug generic name",
          "dose": "exact dose from evidence (e.g., 500mg)",
          "route": "PO/IV/IM/SC/topical",
          "frequency": "OD/BD/TDS/QID/Q8H etc",
          "duration": "duration if specified",
          "renal_adjustment": "if mentioned in evidence",
          "hepatic_adjustment": "if mentioned in evidence",
          "pregnancy_notes": "if mentioned in evidence"
        }}
      ],
      "evidence_chunk_ids": ["chunk_id1", "chunk_id2"]
    }}
  ],
  "second_line_regimens": [
    {{
      "label": "Alternative regimen (e.g., 'If penicillin allergy')",
      "indication_notes": "When to use",
      "drugs": [...],
      "evidence_chunk_ids": []
    }}
  ],
  "supportive_care": ["Supportive measure from evidence"],
  "contraindications_and_cautions": ["Caution from evidence"],
  "monitoring": ["Monitoring parameter from evidence"],
  "red_flags_urgent_referral": ["When to escalate from evidence"],
  "follow_up": ["Follow-up recommendation from evidence"]
}}

IMPORTANT: Only fill fields if information is explicitly in the evidence chunks. Use empty arrays if not found."""


# =============================================================================
# BRAND EXTRACTION PROMPT
# =============================================================================

BRAND_EXTRACTION_PROMPT = """From the drug evidence below, extract Indian brand names for: {generics}

DRUG EVIDENCE:
{drug_evidence}

Return JSON:
{{
  "brands": [
    {{
      "generic": "drug name",
      "brand_names": ["Brand1", "Brand2"],
      "strengths": ["500mg", "250mg"],
      "forms": ["tablet", "capsule", "injection"],
      "price_notes": "if mentioned"
    }}
  ]
}}

ONLY include brands explicitly mentioned in the evidence. If no brand found for a drug, return empty arrays."""


# =============================================================================
# MAIN EXTRACTION FUNCTION
# =============================================================================

def extract_treatment_from_chunks(
    *,
    topic: str,
    age: Optional[int],
    sex: str,
    pregnancy: str,
    severity: Optional[str],
    setting: Optional[str],
    comorbidities: List[str],
    allergies: List[str],
    renal_status: Optional[str],
    hepatic_status: Optional[str],
    current_meds: List[str],
    core_chunks: List[Dict[str, Any]],
    drug_chunks: List[Dict[str, Any]],
    debug: bool = False,
) -> Dict[str, Any]:
    """
    Extract COMPLETE treatment plan with DUAL-MODE response.
    
    GUARANTEE: Will ALWAYS return complete, usable treatment output.
    If RAG evidence is insufficient, LLM fallback is used and CLEARLY LABELED.
    
    Returns dict with:
    - evidence_based: RAG-extracted content
    - llm_guided: Fallback content (if needed)
    - coverage: Section coverage info
    - All standard treatment fields (summary_plan, first_line_regimens, etc.)
    """
    # Build context for resolver
    context = {
        "age": age,
        "sex": sex,
        "pregnancy": pregnancy,
        "severity": severity,
        "setting": setting,
        "comorbidities": comorbidities,
        "allergies": allergies,
        "renal_status": renal_status,
        "hepatic_status": hepatic_status,
        "current_meds": current_meds,
    }
    
    # Combine all chunks
    all_chunks = core_chunks + drug_chunks
    
    # Use Evidence Gap Resolver to ensure exhaustive RAG
    resolver_result = resolve_treatment_evidence(topic, context)
    
    # Merge resolver chunks with provided chunks (dedupe by ID)
    seen_ids = set()
    merged_chunks = []
    for chunk in resolver_result.best_chunks + all_chunks:
        cid = chunk.get("chunk_id") or chunk.get("content_hash") or ""
        if cid and cid not in seen_ids:
            seen_ids.add(cid)
            merged_chunks.append(chunk)
    
    # Step 1: Extract evidence-based content from RAG
    evidence_based = _extract_from_rag(
        topic=topic,
        context=context,
        chunks=merged_chunks[:20],  # Limit for LLM context
        drug_chunks=drug_chunks[:10],
    )
    
    # Step 2: Determine if fallback is needed
    fallback_needed = _needs_fallback(evidence_based, resolver_result)
    
    # Step 3: Generate LLM fallback if needed
    llm_guided = {}
    fallback_sections = []
    
    if fallback_needed:
        # Identify which sections need fallback
        fallback_sections = _identify_weak_sections(evidence_based)
        
        # Generate fallback content
        llm_guided = generate_fallback_content(
            feature="treatment",
            topic=topic,
            context=context,
            sections_needed=fallback_sections,
        )
    
    # Step 4: Build final merged response
    result = _build_complete_response(
        topic=topic,
        evidence_based=evidence_based,
        llm_guided=llm_guided,
        chunks=merged_chunks,
        drug_chunks=drug_chunks,
        resolver_result=resolver_result,
        allergies=allergies,
        current_meds=current_meds,
        fallback_sections=fallback_sections,
    )
    
    # Add debug info if requested
    if debug:
        result["debug"] = {
            "llm_model": LLM_MODEL,
            "resolver_status": resolver_result.coverage_status.value,
            "resolver_log": resolver_result.resolver_log,
            "section_scores": resolver_result.section_scores,
            "total_chunks_retrieved": resolver_result.total_retrieved,
            "total_chunks_kept": resolver_result.total_kept,
            "queries_used": resolver_result.queries_used,
            "fallback_needed": fallback_needed,
            "fallback_sections": fallback_sections,
            "core_chunk_count": len(core_chunks),
            "drug_chunk_count": len(drug_chunks),
            "merged_chunk_count": len(merged_chunks),
        }
    
    return result


def _extract_from_rag(
    topic: str,
    context: Dict[str, Any],
    chunks: List[Dict[str, Any]],
    drug_chunks: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Extract evidence-based content from RAG chunks using LLM."""
    # Build evidence text
    evidence_blocks = []
    chunk_map = {}
    
    for i, chunk in enumerate(chunks):
        chunk_id = chunk.get("chunk_id") or f"core_{i}"
        text = chunk.get("text") or ""
        book = chunk.get("book") or chunk.get("book_id") or "Unknown"
        page = chunk.get("page_start") or ""
        
        chunk_map[chunk_id] = chunk
        evidence_blocks.append(
            f"[CHUNK {chunk_id}] (Source: {book}, p{page})\n{text[:1800]}"
        )
    
    evidence_text = "\n\n---\n\n".join(evidence_blocks)
    
    if not evidence_text.strip():
        evidence_text = "No evidence chunks available."
    
    # Format user prompt
    user_prompt = TREATMENT_RAG_USER_PROMPT.format(
        topic=topic or "Not specified",
        age=context.get("age") or "Not specified",
        sex=context.get("sex") or "Not specified",
        pregnancy=context.get("pregnancy") or "Not specified",
        severity=context.get("severity") or "Not specified",
        setting=context.get("setting") or "Not specified",
        comorbidities=", ".join(context.get("comorbidities") or []) or "None",
        allergies=", ".join(context.get("allergies") or []) or "None",
        renal_status=context.get("renal_status") or "Not specified",
        hepatic_status=context.get("hepatic_status") or "Not specified",
        current_meds=", ".join(context.get("current_meds") or []) or "None",
        evidence_text=evidence_text,
    )
    
    # Call LLM
    llm_response = {}
    
    try:
        llm = get_llm()
        resp = llm.chat.completions.create(
            model=LLM_MODEL,
            temperature=0.1,
            messages=[
                {"role": "system", "content": TREATMENT_RAG_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        )
        raw = resp.choices[0].message.content or ""
        
        # Parse JSON
        json_match = re.search(r"\{[\s\S]*\}", raw)
        if json_match:
            llm_response = json.loads(json_match.group())
    except json.JSONDecodeError:
        pass
    except Exception:
        pass
    
    return llm_response


def _needs_fallback(
    evidence_based: Dict[str, Any],
    resolver_result,
) -> bool:
    """Determine if LLM fallback is needed."""
    # If resolver says insufficient_final, definitely need fallback
    if resolver_result.coverage_status == CoverageStatus.INSUFFICIENT_FINAL:
        return True
    
    # Check if critical sections are empty
    first_line = evidence_based.get("first_line_regimens") or []
    if not first_line:
        return True
    
    # Check if all first-line regimens have empty drugs
    has_drugs = any(
        reg.get("drugs") and len(reg.get("drugs", [])) > 0
        for reg in first_line
    )
    if not has_drugs:
        return True
    
    # Check if doses are present
    has_dose = False
    for reg in first_line:
        for drug in reg.get("drugs") or []:
            if drug.get("dose") and drug.get("dose").strip():
                has_dose = True
                break
    if not has_dose:
        return True
    
    return False


def _identify_weak_sections(evidence_based: Dict[str, Any]) -> List[str]:
    """Identify which sections need fallback content."""
    weak = []
    
    if not evidence_based.get("first_line_regimens"):
        weak.append("first_line_regimens")
    else:
        # Check if drugs have doses
        has_complete_drugs = False
        for reg in evidence_based.get("first_line_regimens", []):
            for drug in reg.get("drugs", []):
                if drug.get("generic") and drug.get("dose"):
                    has_complete_drugs = True
                    break
        if not has_complete_drugs:
            weak.append("first_line_regimens")
    
    if not evidence_based.get("second_line_regimens"):
        weak.append("second_line_regimens")
    
    if not evidence_based.get("contraindications_and_cautions"):
        weak.append("contraindications_and_cautions")
    
    if not evidence_based.get("monitoring"):
        weak.append("monitoring")
    
    if not evidence_based.get("red_flags_urgent_referral"):
        weak.append("red_flags_urgent_referral")
    
    return weak


def _build_complete_response(
    *,
    topic: str,
    evidence_based: Dict[str, Any],
    llm_guided: Dict[str, Any],
    chunks: List[Dict[str, Any]],
    drug_chunks: List[Dict[str, Any]],
    resolver_result,
    allergies: List[str],
    current_meds: List[str],
    fallback_sections: List[str],
) -> Dict[str, Any]:
    """
    Build the COMPLETE treatment response.
    
    GUARANTEE: Every section will have content (evidence-based or llm-guided).
    All fallback content is CLEARLY LABELED.
    """
    # Helper to get best content for a section
    def get_section(key: str, default: Any = None):
        ev_val = evidence_based.get(key)
        llm_val = llm_guided.get(key)
        
        if ev_val and _has_content(ev_val):
            return ev_val, False  # content, is_fallback
        elif llm_val and _has_content(llm_val):
            return llm_val, True
        elif default is not None:
            return default, False
        else:
            return [], False
    
    # Build summary_plan
    summary_plan, summary_fallback = get_section("summary_plan", [f"Treatment plan for {topic}"])
    
    # Build first_line_regimens
    first_line_raw, first_line_fallback = get_section("first_line_regimens", [])
    first_line_regimens = _format_regimens(first_line_raw, first_line_fallback)
    
    # Build second_line_regimens
    second_line_raw, second_line_fallback = get_section("second_line_regimens", [])
    second_line_regimens = _format_regimens(second_line_raw, second_line_fallback)
    
    # Build other sections
    supportive_care, _ = get_section("supportive_care", [])
    contraindications, contra_fallback = get_section("contraindications_and_cautions", [])
    monitoring, monitor_fallback = get_section("monitoring", [])
    red_flags, rf_fallback = get_section("red_flags_urgent_referral", [])
    follow_up, _ = get_section("follow_up", [])
    
    # Check drug interactions with current meds
    drug_interactions_flags = _check_basic_interactions(
        [d.get("generic") for reg in first_line_regimens for d in reg.get("drugs", [])],
        current_meds,
    )
    
    # Extract generics for brand lookup
    generics = _extract_generics_from_regimens(first_line_regimens + second_line_regimens)
    
    # Get brand suggestions
    brands_india = _extract_brands(generics, drug_chunks)
    
    # Build evidence section
    all_chunks = chunks + drug_chunks
    evidence_chunks = [
        {
            "chunk_id": ch.get("chunk_id") or ch.get("content_hash") or "",
            "excerpt": (ch.get("text") or "")[:500],
            "book_id": ch.get("book") or ch.get("book_id"),
            "section_path": ch.get("chapter") or ch.get("section_path"),
            "page_start": ch.get("page_start"),
            "page_end": ch.get("page_end"),
            "score": ch.get("relevance_score") or ch.get("score"),
        }
        for ch in all_chunks[:30]
    ]
    
    # Build coverage info
    fallback_used = bool(fallback_sections)
    coverage = {
        "pass": len(first_line_regimens) > 0 and any(
            reg.get("drugs") for reg in first_line_regimens
        ),
        "missing": [] if len(first_line_regimens) > 0 else ["first_line_regimens"],
        "section_scores": resolver_result.section_scores,
        "fallback_used": fallback_used,
        "fallback_sections": fallback_sections,
        "evidence_chunk_count": len(evidence_chunks),
    }
    
    # Build source labels for each section
    source_labels = {
        "summary_plan": SourceLabel.LLM_GUIDED.value if summary_fallback else SourceLabel.EVIDENCE_BASED.value,
        "first_line_regimens": SourceLabel.LLM_GUIDED.value if first_line_fallback else SourceLabel.EVIDENCE_BASED.value,
        "second_line_regimens": SourceLabel.LLM_GUIDED.value if second_line_fallback else SourceLabel.EVIDENCE_BASED.value,
        "contraindications_and_cautions": SourceLabel.LLM_GUIDED.value if contra_fallback else SourceLabel.EVIDENCE_BASED.value,
        "monitoring": SourceLabel.LLM_GUIDED.value if monitor_fallback else SourceLabel.EVIDENCE_BASED.value,
        "red_flags_urgent_referral": SourceLabel.LLM_GUIDED.value if rf_fallback else SourceLabel.EVIDENCE_BASED.value,
    }
    
    return {
        "topic": topic,
        "summary_plan": summary_plan,
        "first_line_regimens": first_line_regimens,
        "second_line_regimens": second_line_regimens,
        "supportive_care": supportive_care,
        "contraindications_and_cautions": contraindications,
        "monitoring": monitoring,
        "drug_interactions_flags": drug_interactions_flags,
        "red_flags_urgent_referral": red_flags,
        "follow_up": follow_up,
        "brands_india": brands_india,
        "evidence": {
            "chunks": evidence_chunks,
            "coverage": coverage,
        },
        "source_labels": source_labels,
        "llm_guided_warning": (
            "Some sections contain LLM-generated guidance (marked as LLM-GUIDED). "
            "Verify with local guidelines and clinical judgment."
        ) if fallback_used else None,
    }


def _format_regimens(regimens_raw: List[Any], is_fallback: bool) -> List[Dict[str, Any]]:
    """Format regimens with proper structure and labels."""
    formatted = []
    
    for reg in regimens_raw:
        if not isinstance(reg, dict):
            continue
        
        drugs = []
        for drug in reg.get("drugs") or []:
            if not isinstance(drug, dict):
                continue
            
            # Ensure dose has warning if from fallback
            dose = drug.get("dose") or ""
            if is_fallback and dose and "VERIFY" not in dose.upper():
                dose = f"{dose} - VERIFY DOSE"
            
            drugs.append({
                "generic": drug.get("generic") or "",
                "dose": dose,
                "route": drug.get("route") or "",
                "frequency": drug.get("frequency") or "",
                "duration": drug.get("duration") or "",
                "weight_based": drug.get("weight_based"),
                "renal_adjustment": drug.get("renal_adjustment"),
                "hepatic_adjustment": drug.get("hepatic_adjustment"),
                "pregnancy_notes": drug.get("pregnancy_notes"),
                "key_contraindications": drug.get("key_contraindications") or [],
                "monitoring": drug.get("monitoring") or [],
                "verify_dose_warning": is_fallback or drug.get("verify_dose_warning", False),
            })
        
        if drugs or reg.get("label"):
            formatted.append({
                "label": reg.get("label") or "Treatment regimen",
                "indication_notes": reg.get("indication_notes") or "",
                "drugs": drugs,
                "source_label": SourceLabel.LLM_GUIDED.value if is_fallback else SourceLabel.EVIDENCE_BASED.value,
            })
    
    return formatted


def _has_content(val: Any) -> bool:
    """Check if value has meaningful content."""
    if val is None:
        return False
    if isinstance(val, str):
        return bool(val.strip()) and val.lower() not in [
            "not found in sources", "insufficient evidence", "not specified", "none", ""
        ]
    if isinstance(val, (list, dict)):
        return bool(val)
    return True


def _extract_generics_from_regimens(regimens: List[Dict[str, Any]]) -> List[str]:
    """Extract unique generic drug names from regimens."""
    generics = set()
    for reg in regimens:
        for drug in reg.get("drugs") or []:
            name = drug.get("generic") or ""
            if name and len(name) > 2:
                generics.add(name.lower().strip())
    return list(generics)


def _extract_brands(
    generics: List[str],
    drug_chunks: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Extract brand names from drug evidence."""
    if not generics or not drug_chunks:
        # Return placeholders for each generic
        return [
            {
                "generic": g,
                "brand_names": [],
                "strengths": [],
                "forms": [],
                "price_notes": "Not found in sources",
                "source": "MIMS",
                "evidence_chunk_ids": [],
            }
            for g in generics
        ]
    
    # Build evidence text
    drug_evidence_blocks = []
    for i, chunk in enumerate(drug_chunks[:10]):
        text = chunk.get("text") or ""
        book = chunk.get("book") or chunk.get("book_id") or "MIMS/Tripathi"
        drug_evidence_blocks.append(f"[DRUG {i}] ({book})\n{text[:1000]}")
    
    drug_evidence = "\n\n---\n\n".join(drug_evidence_blocks)
    
    if not drug_evidence.strip():
        return [
            {
                "generic": g,
                "brand_names": [],
                "strengths": [],
                "forms": [],
                "price_notes": "Not found in sources",
                "source": "MIMS",
                "evidence_chunk_ids": [],
            }
            for g in generics
        ]
    
    prompt = BRAND_EXTRACTION_PROMPT.format(
        generics=", ".join(generics),
        drug_evidence=drug_evidence,
    )
    
    try:
        llm = get_llm()
        resp = llm.chat.completions.create(
            model=LLM_MODEL,
            temperature=0.0,
            messages=[
                {"role": "system", "content": "Extract brand names only from evidence. Do not invent."},
                {"role": "user", "content": prompt},
            ],
        )
        raw = resp.choices[0].message.content or ""
        
        json_match = re.search(r"\{[\s\S]*\}", raw)
        if json_match:
            data = json.loads(json_match.group())
            brands = data.get("brands") or []
            
            # Format and add source info
            formatted = []
            found_generics = set()
            
            for b in brands:
                generic = b.get("generic") or ""
                found_generics.add(generic.lower())
                formatted.append({
                    "generic": generic,
                    "brand_names": b.get("brand_names") or [],
                    "strengths": b.get("strengths") or [],
                    "forms": b.get("forms") or [],
                    "price_notes": b.get("price_notes"),
                    "source": "MIMS/Tripathi",
                    "evidence_chunk_ids": [ch.get("chunk_id") for ch in drug_chunks[:3]],
                })
            
            # Add placeholders for generics not found
            for g in generics:
                if g.lower() not in found_generics:
                    formatted.append({
                        "generic": g,
                        "brand_names": [],
                        "strengths": [],
                        "forms": [],
                        "price_notes": "Not found in sources",
                        "source": "MIMS",
                        "evidence_chunk_ids": [],
                    })
            
            return formatted
    except Exception:
        pass
    
    # Fallback: return placeholders
    return [
        {
            "generic": g,
            "brand_names": [],
            "strengths": [],
            "forms": [],
            "price_notes": "Not found in sources",
            "source": "MIMS",
            "evidence_chunk_ids": [],
        }
        for g in generics
    ]


def _check_basic_interactions(
    new_drugs: List[str],
    current_meds: List[str],
) -> List[Dict[str, str]]:
    """Check for basic drug interactions."""
    flags = []
    
    new_lower = {d.lower() for d in new_drugs if d}
    current_lower = {m.lower() for m in current_meds if m}
    
    # Basic interaction rules
    interactions = [
        ({"warfarin"}, {"aspirin", "ibuprofen", "nsaid", "naproxen"}, "Increased bleeding risk"),
        ({"methotrexate"}, {"nsaid", "trimethoprim", "sulfamethoxazole"}, "Increased methotrexate toxicity"),
        ({"digoxin"}, {"amiodarone", "verapamil", "diltiazem"}, "Increased digoxin levels"),
        ({"lisinopril", "enalapril", "ramipril", "ace inhibitor"}, {"potassium", "spironolactone"}, "Hyperkalemia risk"),
        ({"lithium"}, {"nsaid", "ace inhibitor", "diuretic", "ibuprofen"}, "Increased lithium levels"),
        ({"fluoxetine", "sertraline", "paroxetine", "ssri"}, {"maoi", "tramadol", "linezolid"}, "Serotonin syndrome risk"),
        ({"metformin"}, {"contrast dye", "iodinated contrast"}, "Lactic acidosis risk"),
        ({"simvastatin", "atorvastatin"}, {"clarithromycin", "erythromycin", "itraconazole"}, "Increased statin toxicity"),
    ]
    
    for drug_set1, drug_set2, message in interactions:
        if (new_lower & drug_set1 and current_lower & drug_set2) or \
           (new_lower & drug_set2 and current_lower & drug_set1):
            flags.append({
                "drug": ", ".join(new_lower & (drug_set1 | drug_set2)),
                "interacting_with": ", ".join(current_lower & (drug_set1 | drug_set2)),
                "message": message,
                "severity": "high",
            })
    
    return flags
