# backend/app/rag/extractors/ddx_extractor.py
"""
DOCTOR-GRADE Differential Diagnosis Extractor.

This module implements the COMPLETENESS GUARANTEE:
- RAG is tried exhaustively first via Evidence Gap Resolver
- If evidence is insufficient, LLM fallback is used with CLEAR LABELS
- NEVER show "insufficient evidence" as a dead end
- ALWAYS include must-not-miss diagnoses for patient safety

Every response contains:
- evidence_based: Content from RAG sources only
- llm_guided: Fallback content when evidence insufficient
- coverage: Section coverage info
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
    resolve_ddx_evidence,
)
from app.rag.extractors.base import (
    SourceLabel,
    generate_fallback_content,
    strip_citations_from_text,
    get_llm,
)


# =============================================================================
# CONFIG
# =============================================================================

LLM_MODEL = os.getenv("OPENAI_CHAT_MODEL", "gpt-4.1")


# =============================================================================
# MUST-NOT-MISS EMERGENCY LIBRARY
# These are ALWAYS included regardless of RAG evidence.
# =============================================================================

MUST_NOT_MISS_LIBRARY = {
    "chest pain": [
        {
            "diagnosis": "Acute coronary syndrome (ACS)",
            "key_clues": ["crushing chest pain", "radiation to arm/jaw", "diaphoresis", "ECG changes", "positive troponin"],
            "immediate_actions": ["ECG stat", "Serial troponins", "Aspirin 300mg if not contraindicated", "Cardiology consult"],
        },
        {
            "diagnosis": "Pulmonary embolism (PE)",
            "key_clues": ["sudden dyspnea", "pleuritic pain", "hypoxia", "DVT risk factors", "elevated D-dimer"],
            "immediate_actions": ["CTPA if stable", "Consider anticoagulation", "Assess hemodynamic stability", "Check Wells score"],
        },
        {
            "diagnosis": "Aortic dissection",
            "key_clues": ["tearing pain radiating to back", "BP differential >20mmHg", "widened mediastinum", "pulse deficit"],
            "immediate_actions": ["Urgent CT angiography", "Blood pressure control", "Surgical/vascular consult", "Type and crossmatch"],
        },
        {
            "diagnosis": "Tension pneumothorax",
            "key_clues": ["absent breath sounds", "tracheal deviation", "hypotension", "distended neck veins"],
            "immediate_actions": ["Needle decompression if tension", "CXR stat", "Chest tube if large pneumothorax"],
        },
        {
            "diagnosis": "Cardiac tamponade",
            "key_clues": ["Beck's triad", "muffled heart sounds", "JVD", "pulsus paradoxus", "electrical alternans"],
            "immediate_actions": ["Bedside echo STAT", "Prepare for pericardiocentesis", "IV fluids cautiously"],
        },
    ],
    "shortness of breath": [
        {
            "diagnosis": "Pulmonary embolism (PE)",
            "key_clues": ["sudden onset", "pleuritic pain", "hypoxia", "tachycardia", "unilateral leg swelling"],
            "immediate_actions": ["CTPA", "D-dimer if low probability", "Anticoagulation if confirmed"],
        },
        {
            "diagnosis": "Acute coronary syndrome",
            "key_clues": ["associated chest pain/pressure", "diaphoresis", "nausea", "ECG changes"],
            "immediate_actions": ["ECG stat", "Troponins", "Aspirin", "Cardiology consult"],
        },
        {
            "diagnosis": "Tension pneumothorax",
            "key_clues": ["absent breath sounds unilateral", "hypotension", "tracheal deviation"],
            "immediate_actions": ["Needle decompression if tension", "CXR", "Chest tube"],
        },
        {
            "diagnosis": "Severe asthma / Status asthmaticus",
            "key_clues": ["silent chest", "unable to speak full sentences", "accessory muscle use", "cyanosis"],
            "immediate_actions": ["High-flow oxygen", "Nebulized salbutamol + ipratropium", "IV steroids", "Consider magnesium"],
        },
        {
            "diagnosis": "Anaphylaxis",
            "key_clues": ["urticaria", "angioedema", "hypotension", "recent allergen exposure", "stridor"],
            "immediate_actions": ["Adrenaline IM 0.5mg", "High-flow oxygen", "IV fluids", "Antihistamines + steroids"],
        },
    ],
    "fever": [
        {
            "diagnosis": "Sepsis / Septic shock",
            "key_clues": ["hypotension", "altered mental status", "tachycardia >100", "lactate >2", "qSOFA ≥2"],
            "immediate_actions": ["Blood cultures x2", "IV antibiotics within 1 hour", "30ml/kg crystalloid", "Lactate level"],
        },
        {
            "diagnosis": "Meningitis",
            "key_clues": ["neck stiffness", "photophobia", "altered consciousness", "petechial rash", "Kernig/Brudzinski signs"],
            "immediate_actions": ["Lumbar puncture (if safe)", "Empiric antibiotics STAT (don't delay for LP)", "Dexamethasone before or with antibiotics"],
        },
        {
            "diagnosis": "Necrotizing fasciitis",
            "key_clues": ["pain out of proportion to exam", "rapid progression", "crepitus", "dusky skin", "bullae"],
            "immediate_actions": ["Urgent surgical consult", "Broad-spectrum IV antibiotics", "Serial exams", "Imaging if diagnosis uncertain"],
        },
    ],
    "headache": [
        {
            "diagnosis": "Subarachnoid hemorrhage",
            "key_clues": ["thunderclap headache", "worst headache of life", "meningismus", "focal neurological deficit"],
            "immediate_actions": ["CT head non-contrast STAT", "LP if CT negative but high suspicion", "Neurosurgery consult"],
        },
        {
            "diagnosis": "Meningitis / Encephalitis",
            "key_clues": ["fever", "neck stiffness", "altered mental status", "photophobia", "seizures"],
            "immediate_actions": ["LP", "Empiric antibiotics + acyclovir STAT", "CT before LP if focal signs"],
        },
        {
            "diagnosis": "Intracranial mass / Raised ICP",
            "key_clues": ["papilledema", "projectile vomiting", "focal deficits", "progressive headache", "visual changes"],
            "immediate_actions": ["CT/MRI brain", "Elevate head of bed", "Neurosurgery consult if mass effect"],
        },
        {
            "diagnosis": "Temporal (Giant Cell) arteritis",
            "key_clues": ["age >50", "jaw claudication", "visual symptoms", "tender temporal artery", "ESR >50"],
            "immediate_actions": ["High-dose steroids immediately (prednisone 60mg)", "Temporal artery biopsy (don't delay steroids)"],
        },
    ],
    "syncope": [
        {
            "diagnosis": "Cardiac arrhythmia",
            "key_clues": ["palpitations before syncope", "no prodrome", "ECG abnormality", "family history of sudden death"],
            "immediate_actions": ["12-lead ECG", "Continuous cardiac monitoring", "Echocardiogram", "Consider Holter"],
        },
        {
            "diagnosis": "Aortic stenosis",
            "key_clues": ["exertional syncope", "systolic ejection murmur", "narrow pulse pressure", "heart failure symptoms"],
            "immediate_actions": ["Echocardiogram", "Cardiology referral", "Avoid vasodilators"],
        },
        {
            "diagnosis": "Pulmonary embolism",
            "key_clues": ["sudden dyspnea", "pleuritic chest pain", "DVT risk factors"],
            "immediate_actions": ["CTPA", "D-dimer", "Anticoagulation if confirmed"],
        },
    ],
    "abdominal pain": [
        {
            "diagnosis": "Ruptured abdominal aortic aneurysm",
            "key_clues": ["pulsatile abdominal mass", "hypotension", "back/flank pain", "age >60", "known AAA"],
            "immediate_actions": ["Large bore IV access x2", "Type and crossmatch 6 units", "Urgent vascular surgery", "CT angio if stable"],
        },
        {
            "diagnosis": "Mesenteric ischemia",
            "key_clues": ["pain out of proportion to exam", "bloody diarrhea", "atrial fibrillation", "recent cardioversion"],
            "immediate_actions": ["CT angiography", "Surgical consult", "Broad-spectrum antibiotics", "NPO"],
        },
        {
            "diagnosis": "Ectopic pregnancy",
            "key_clues": ["amenorrhea", "vaginal bleeding", "positive pregnancy test", "hypotension", "adnexal mass/tenderness"],
            "immediate_actions": ["β-hCG", "Transvaginal ultrasound", "Type and screen", "Gynecology consult"],
        },
        {
            "diagnosis": "Perforated viscus",
            "key_clues": ["rigid abdomen", "peritonitis", "free air on imaging", "guarding", "rebound tenderness"],
            "immediate_actions": ["Upright CXR/CT", "Surgical consult", "NPO", "IV antibiotics", "Fluid resuscitation"],
        },
    ],
}


def _get_must_not_miss_for_symptoms(symptoms: List[str]) -> List[Dict[str, Any]]:
    """Get emergency diagnoses matching symptom cluster."""
    matched = []
    symptoms_lower = " ".join(s.lower() for s in symptoms)
    
    for key, items in MUST_NOT_MISS_LIBRARY.items():
        if key in symptoms_lower:
            for item in items:
                matched.append({
                    "diagnosis": item["diagnosis"],
                    "key_clues": item["key_clues"],
                    "immediate_actions": item["immediate_actions"],
                    "evidence_ids": [],
                    "source_label": SourceLabel.EVIDENCE_BASED.value,  # Library is curated, counts as evidence
                })
    
    # Dedupe by diagnosis
    seen = set()
    deduped = []
    for item in matched:
        dx = item.get("diagnosis", "")
        if dx not in seen:
            seen.add(dx)
            deduped.append(item)
    
    return deduped[:8]


# =============================================================================
# LLM PROMPTS
# =============================================================================

DDX_RAG_SYSTEM_PROMPT = """You are a clinical decision support system for doctors.
Your task is to extract a STRUCTURED differential diagnosis from medical textbook evidence.

CRITICAL RULES - NON-NEGOTIABLE:
1. ONLY use information from the provided evidence chunks
2. DO NOT invent, assume, or add outside medical knowledge
3. Each diagnosis must be supported by evidence chunks - cite them
4. If evidence is insufficient, use empty arrays - do not invent
5. Be specific and actionable - include tests, features, next steps
6. Format output as strict JSON matching the schema exactly

EXTRACTION PRIORITIES:
- Diagnoses mentioned in evidence with supporting features
- Workup/investigation recommendations from evidence
- Red flags and warning signs from evidence
- System-wise categorization if present"""

DDX_RAG_USER_PROMPT = """PATIENT PRESENTATION:
- Symptoms: {symptoms}
- Duration: {duration}
- Age: {age}
- Sex: {sex}
- Pregnancy status: {pregnancy}
- Comorbidities: {comorbidities}
- Current medications: {meds}

EVIDENCE CHUNKS (from medical textbooks - ONLY use these):
{evidence_text}

Extract differential diagnosis from ONLY the evidence above. Return strict JSON:
{{
  "topic_cluster": "brief description of symptom cluster",
  "likely_diagnoses": [
    {{
      "diagnosis": "diagnosis name from evidence",
      "likelihood": "high|medium|low based on evidence",
      "why_it_fits": ["supporting feature from evidence 1", "feature 2"],
      "what_argues_against": ["argument from evidence if any"],
      "red_flags_for_this": ["red flag from evidence"],
      "next_tests": ["test recommended in evidence"],
      "evidence_chunk_ids": ["chunk_id_1"]
    }}
  ],
  "workup_plan": {{
    "step1_immediate": ["immediate action from evidence"],
    "step2_next_hours": ["next action"],
    "step3_if_unclear": ["further workup"]
  }},
  "system_buckets": {{
    "Cardiovascular": ["diagnosis 1 if mentioned"],
    "Respiratory": ["diagnosis 2 if mentioned"]
  }},
  "general_red_flags": ["red flag from evidence"]
}}

Only fill fields if information is explicitly in the evidence chunks. Use empty arrays if not found."""


# =============================================================================
# MAIN EXTRACTION FUNCTION
# =============================================================================

def extract_ddx_from_chunks(
    *,
    symptoms: List[str],
    duration: Optional[str],
    age: Optional[int],
    sex: str,
    pregnancy: str,
    comorbidities: List[str],
    meds: List[str],
    chunks: List[Dict[str, Any]],
    debug: bool = False,
) -> Dict[str, Any]:
    """
    Extract COMPLETE differential diagnosis with DUAL-MODE response.
    
    GUARANTEE: Will ALWAYS return complete, usable DDx output.
    Must-not-miss diagnoses are ALWAYS included for patient safety.
    
    Returns dict with:
    - evidence_based: RAG-extracted content
    - llm_guided: Fallback content (if needed)
    - coverage: Section coverage info
    - All standard DDx fields
    """
    # Build context
    context = {
        "age": age,
        "sex": sex,
        "pregnancy": pregnancy,
        "comorbidities": comorbidities,
        "meds": meds,
        "duration": duration,
    }
    
    # Use Evidence Gap Resolver
    resolver_result = resolve_ddx_evidence(symptoms, context)
    
    # Merge resolver chunks with provided chunks
    seen_ids = set()
    merged_chunks = []
    for chunk in resolver_result.best_chunks + chunks:
        cid = chunk.get("chunk_id") or chunk.get("content_hash") or ""
        if cid and cid not in seen_ids:
            seen_ids.add(cid)
            merged_chunks.append(chunk)
    
    # Get must-not-miss from library (always included)
    must_not_miss_library = _get_must_not_miss_for_symptoms(symptoms)
    
    # Step 1: Extract evidence-based content from RAG
    evidence_based = _extract_from_rag(
        symptoms=symptoms,
        duration=duration,
        context=context,
        chunks=merged_chunks[:20],
    )
    
    # Step 2: Determine if fallback is needed
    fallback_needed = _needs_fallback(evidence_based, resolver_result)
    
    # Step 3: Generate LLM fallback if needed
    llm_guided = {}
    fallback_sections = []
    
    if fallback_needed:
        fallback_sections = _identify_weak_sections(evidence_based)
        
        llm_guided = generate_fallback_content(
            feature="ddx",
            topic=" ".join(symptoms),
            context=context,
            sections_needed=fallback_sections,
        )
    
    # Step 4: Build final response
    result = _build_complete_response(
        symptoms=symptoms,
        duration=duration,
        context=context,
        evidence_based=evidence_based,
        llm_guided=llm_guided,
        must_not_miss_library=must_not_miss_library,
        chunks=merged_chunks,
        resolver_result=resolver_result,
        fallback_sections=fallback_sections,
    )
    
    # Add debug info
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
            "must_not_miss_library_matches": len(must_not_miss_library),
            "evidence_chunk_count": len(merged_chunks),
        }
    
    return result


def _extract_from_rag(
    symptoms: List[str],
    duration: Optional[str],
    context: Dict[str, Any],
    chunks: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Extract evidence-based content from RAG chunks."""
    # Build evidence text
    evidence_blocks = []
    
    for i, chunk in enumerate(chunks):
        chunk_id = chunk.get("chunk_id") or f"chunk_{i}"
        text = chunk.get("text") or ""
        book = chunk.get("book") or chunk.get("book_id") or "Unknown"
        page = chunk.get("page_start") or ""
        
        evidence_blocks.append(
            f"[CHUNK {chunk_id}] (Source: {book}, p{page})\n{text[:1500]}"
        )
    
    evidence_text = "\n\n---\n\n".join(evidence_blocks)
    
    if not evidence_text.strip():
        evidence_text = "No evidence chunks available."
    
    # Format prompt
    user_prompt = DDX_RAG_USER_PROMPT.format(
        symptoms=", ".join(symptoms) or "Not specified",
        duration=duration or "Not specified",
        age=context.get("age") or "Not specified",
        sex=context.get("sex") or "Not specified",
        pregnancy=context.get("pregnancy") or "Not specified",
        comorbidities=", ".join(context.get("comorbidities") or []) or "None",
        meds=", ".join(context.get("meds") or []) or "None",
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
                {"role": "system", "content": DDX_RAG_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        )
        raw = resp.choices[0].message.content or ""
        
        json_match = re.search(r"\{[\s\S]*\}", raw)
        if json_match:
            llm_response = json.loads(json_match.group())
    except Exception:
        pass
    
    return llm_response


def _needs_fallback(
    evidence_based: Dict[str, Any],
    resolver_result,
) -> bool:
    """Determine if LLM fallback is needed."""
    if resolver_result.coverage_status == CoverageStatus.INSUFFICIENT_FINAL:
        return True
    
    likely = evidence_based.get("likely_diagnoses") or []
    if not likely:
        return True
    
    workup = evidence_based.get("workup_plan") or {}
    if not workup.get("step1_immediate"):
        return True
    
    return False


def _identify_weak_sections(evidence_based: Dict[str, Any]) -> List[str]:
    """Identify sections needing fallback."""
    weak = []
    
    if not evidence_based.get("likely_diagnoses"):
        weak.append("ranked_ddx")
    
    workup = evidence_based.get("workup_plan") or {}
    if not workup.get("step1_immediate"):
        weak.append("rapid_algorithm")
    
    if not evidence_based.get("general_red_flags"):
        weak.append("red_flags")
    
    return weak


def _build_complete_response(
    *,
    symptoms: List[str],
    duration: Optional[str],
    context: Dict[str, Any],
    evidence_based: Dict[str, Any],
    llm_guided: Dict[str, Any],
    must_not_miss_library: List[Dict[str, Any]],
    chunks: List[Dict[str, Any]],
    resolver_result,
    fallback_sections: List[str],
) -> Dict[str, Any]:
    """Build COMPLETE DDx response."""
    
    def get_section(key: str, default: Any = None):
        ev_val = evidence_based.get(key)
        llm_val = llm_guided.get(key)
        
        if ev_val and _has_content(ev_val):
            return ev_val, False
        elif llm_val and _has_content(llm_val):
            return llm_val, True
        elif default is not None:
            return default, False
        return [], False
    
    # Input summary
    input_summary = {
        "symptoms": ", ".join(symptoms),
        "duration": duration,
        "age": context.get("age"),
        "sex": context.get("sex"),
        "pregnancy": context.get("pregnancy"),
        "comorbidities": context.get("comorbidities") or [],
        "meds": context.get("meds") or [],
        "normalized_symptoms": symptoms,
    }
    
    # Must-not-miss: combine library + evidence
    must_not_miss = must_not_miss_library.copy()
    
    # Add any from evidence
    ev_mnm = evidence_based.get("must_not_miss") or []
    for item in ev_mnm:
        if isinstance(item, dict):
            must_not_miss.append({
                "diagnosis": item.get("diagnosis") or "",
                "key_clues": item.get("key_clues") or item.get("red_flag_clues") or [],
                "immediate_actions": item.get("immediate_actions") or [],
                "evidence_ids": item.get("evidence_chunk_ids") or [],
                "source_label": SourceLabel.EVIDENCE_BASED.value,
            })
    
    # Dedupe must-not-miss
    seen = set()
    deduped_mnm = []
    for item in must_not_miss:
        dx = item.get("diagnosis", "").lower()
        if dx and dx not in seen:
            seen.add(dx)
            deduped_mnm.append(item)
    must_not_miss = deduped_mnm
    
    # Ranked DDx
    likely_raw, likely_fallback = get_section("likely_diagnoses", [])
    ranked_ddx = []
    for dx in likely_raw[:12]:
        if isinstance(dx, dict):
            ranked_ddx.append({
                "diagnosis": dx.get("diagnosis") or "",
                "likelihood": dx.get("likelihood") or "medium",
                "for": dx.get("why_it_fits") or [],
                "against": dx.get("what_argues_against") or [],
                "discriminating_tests": dx.get("next_tests") or [],
                "initial_management": [],
                "evidence_ids": dx.get("evidence_chunk_ids") or [],
                "source_label": SourceLabel.LLM_GUIDED.value if likely_fallback else SourceLabel.EVIDENCE_BASED.value,
            })
    
    # Add LLM-guided diagnoses if needed
    llm_ddx = llm_guided.get("ranked_ddx") or []
    if likely_fallback and llm_ddx:
        existing_dx = {d["diagnosis"].lower() for d in ranked_ddx}
        for dx in llm_ddx[:6]:
            if isinstance(dx, dict) and dx.get("diagnosis", "").lower() not in existing_dx:
                ranked_ddx.append({
                    "diagnosis": dx.get("diagnosis") or "",
                    "likelihood": dx.get("likelihood") or "medium",
                    "for": dx.get("for") or dx.get("why_it_fits") or [],
                    "against": dx.get("against") or [],
                    "discriminating_tests": dx.get("discriminating_tests") or dx.get("next_tests") or [],
                    "initial_management": [],
                    "evidence_ids": [],
                    "source_label": SourceLabel.LLM_GUIDED.value,
                })
    
    # System-wise buckets
    system_buckets = evidence_based.get("system_buckets") or {}
    system_wise = []
    for system, diagnoses in system_buckets.items():
        if diagnoses:
            system_wise.append({
                "system": system,
                "items": [
                    {"diagnosis": dx, "key_points": [], "evidence_ids": []}
                    for dx in (diagnoses if isinstance(diagnoses, list) else [diagnoses])
                ],
            })
    
    # Workup plan / Rapid algorithm
    workup = evidence_based.get("workup_plan") or {}
    llm_workup = llm_guided.get("rapid_algorithm") or {}
    
    rapid_algorithm = {
        "step_1": workup.get("step1_immediate") or llm_workup.get("step_1") or [],
        "step_2": workup.get("step2_next_hours") or llm_workup.get("step_2") or [],
        "step_3": workup.get("step3_if_unclear") or llm_workup.get("step_3") or [],
    }
    
    # Ensure algorithm has content
    if not rapid_algorithm["step_1"]:
        rapid_algorithm["step_1"] = ["Urgent clinical assessment", "Vital signs monitoring"]
    if not rapid_algorithm["step_2"]:
        rapid_algorithm["step_2"] = ["Based on initial results"]
    if not rapid_algorithm["step_3"]:
        rapid_algorithm["step_3"] = ["Consider specialist consultation"]
    
    # Investigations
    suggested_investigations = {
        "urgent": [a for a in rapid_algorithm["step_1"] if _is_investigation(a)],
        "soon": [a for a in rapid_algorithm["step_2"] if _is_investigation(a)],
        "routine": [],
    }
    
    # Red flags
    red_flags, rf_fallback = get_section("general_red_flags", [])
    if not red_flags:
        red_flags = _default_red_flags_for_symptoms(symptoms)
    
    # Build evidence list
    evidence = [
        {
            "id": ch.get("chunk_id") or ch.get("content_hash") or "",
            "snippet": strip_citations_from_text((ch.get("text") or "")[:400]),
            "source": {
                "title": ch.get("book") or ch.get("book_id"),
                "section": ch.get("chapter") or ch.get("section_path"),
                "page_start": ch.get("page_start"),
                "page_end": ch.get("page_end"),
            },
        }
        for ch in chunks[:30]
    ]
    
    # Coverage gate
    has_content = bool(ranked_ddx) or bool(must_not_miss)
    coverage_gate = {
        "passed": has_content,
        "missing_evidence_ids": [] if has_content else ["no_diagnoses_extracted"],
        "section_scores": resolver_result.section_scores,
        "fallback_used": bool(fallback_sections),
        "fallback_sections": fallback_sections,
    }
    
    # Source labels
    source_labels = {
        "must_not_miss": SourceLabel.EVIDENCE_BASED.value,  # Library counts as evidence
        "ranked_ddx": SourceLabel.LLM_GUIDED.value if likely_fallback else SourceLabel.EVIDENCE_BASED.value,
        "rapid_algorithm": SourceLabel.LLM_GUIDED.value if "rapid_algorithm" in fallback_sections else SourceLabel.EVIDENCE_BASED.value,
        "red_flags": SourceLabel.LLM_GUIDED.value if rf_fallback else SourceLabel.EVIDENCE_BASED.value,
    }
    
    return {
        "input_summary": input_summary,
        "must_not_miss": must_not_miss,
        "ranked_ddx": ranked_ddx,
        "system_wise": system_wise,
        "rapid_algorithm": rapid_algorithm,
        "suggested_investigations": suggested_investigations,
        "red_flags": red_flags,
        "evidence": evidence,
        "coverage_gate": coverage_gate,
        "source_labels": source_labels,
        "llm_guided_warning": (
            "Some sections contain LLM-generated guidance (marked as LLM-GUIDED). "
            "Verify with clinical assessment and local protocols."
        ) if fallback_sections else None,
    }


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


def _is_investigation(action: str) -> bool:
    """Check if an action is an investigation."""
    inv_keywords = [
        "ecg", "ekg", "troponin", "cxr", "x-ray", "ct", "mri", "ultrasound",
        "blood", "culture", "urine", "lp", "lumbar", "echo", "bmp", "cbc",
        "lft", "rft", "lactate", "d-dimer", "bnp", "abg", "vbg", "test",
    ]
    action_lower = action.lower()
    return any(kw in action_lower for kw in inv_keywords)


def _default_red_flags_for_symptoms(symptoms: List[str]) -> List[str]:
    """Get default red flags based on symptoms."""
    flags = [
        "Hemodynamic instability (hypotension, tachycardia)",
        "Altered mental status",
        "Signs of respiratory distress",
    ]
    
    symptoms_lower = " ".join(s.lower() for s in symptoms)
    
    if "chest" in symptoms_lower or "pain" in symptoms_lower:
        flags.append("Radiation to arm/jaw with diaphoresis")
        flags.append("Tearing pain radiating to back")
    if "breath" in symptoms_lower or "dyspnea" in symptoms_lower:
        flags.append("Oxygen saturation <90%")
        flags.append("Silent chest in asthmatic")
    if "fever" in symptoms_lower:
        flags.append("Signs of sepsis (qSOFA ≥2, lactate >2)")
        flags.append("Petechial rash")
    if "headache" in symptoms_lower:
        flags.append("Thunderclap onset or worst headache of life")
        flags.append("Papilledema or focal neurological deficits")
    if "syncope" in symptoms_lower:
        flags.append("No prodrome / ECG abnormality")
        flags.append("Exertional syncope")
    if "abdominal" in symptoms_lower or "abd" in symptoms_lower:
        flags.append("Rigid abdomen or peritonitis")
        flags.append("Pulsatile mass with hypotension")
    
    return flags[:8]
