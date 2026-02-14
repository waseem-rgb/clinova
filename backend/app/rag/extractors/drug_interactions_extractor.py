# backend/app/rag/extractors/drug_interactions_extractor.py
"""
DOCTOR-GRADE Drug Interactions Extractor
Evidence-first with labeled LLM fallback for completeness guarantee.
Includes rule-based critical interaction alerts for patient safety.
"""
from __future__ import annotations

import json
import os
import re
from itertools import combinations
from typing import Any, Dict, List, Optional, Set, Tuple

from openai import OpenAI

from app.rag.resolver import (
    resolve_interaction_evidence,
    CoverageStatus,
    ResolverResult,
)
from app.rag.extractors.base import (
    SourceLabel,
    DualModeResponseBase,
    generate_fallback_content,
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
# CRITICAL INTERACTION RULES (Rule-based safety layer - always applied)
# These are MUST-NOT-MISS interactions regardless of RAG results
# =============================================================================

CRITICAL_INTERACTIONS = {
    # QT Prolongation combinations
    ("amiodarone", "haloperidol"): {
        "severity": "Contraindicated",
        "mechanism": "Additive QT prolongation",
        "clinical_effect": "Torsades de Pointes, sudden cardiac death",
        "management": "AVOID combination. If essential, continuous cardiac monitoring required.",
        "monitoring": "Continuous ECG, baseline and serial QTc measurement",
        "rule_based": True,
        "critical_alert": True,
    },
    ("methadone", "fluoroquinolone"): {
        "severity": "Major",
        "mechanism": "Both prolong QT interval",
        "clinical_effect": "Increased risk of Torsades de Pointes",
        "management": "Avoid if possible. Monitor QTc closely if unavoidable.",
        "monitoring": "ECG before initiation, QTc at 2-4 weeks",
        "rule_based": True,
        "critical_alert": True,
    },
    
    # Bleeding combinations
    ("warfarin", "aspirin"): {
        "severity": "Major",
        "mechanism": "Aspirin inhibits platelet function + warfarin inhibits clotting factors",
        "clinical_effect": "Significantly increased bleeding risk, GI hemorrhage",
        "management": "Use only if indicated (e.g., mechanical valve + CAD). Low-dose aspirin preferred.",
        "monitoring": "INR more frequently, watch for bleeding signs",
        "rule_based": True,
        "critical_alert": True,
    },
    ("warfarin", "nsaid"): {
        "severity": "Major",
        "mechanism": "NSAIDs inhibit platelets and cause GI erosion",
        "clinical_effect": "Increased GI bleeding risk, INR may increase",
        "management": "Avoid NSAIDs. Use acetaminophen for pain. If essential, add PPI.",
        "monitoring": "INR, signs of GI bleeding",
        "rule_based": True,
        "critical_alert": True,
    },
    ("dabigatran", "aspirin"): {
        "severity": "Major",
        "mechanism": "Additive anticoagulant and antiplatelet effects",
        "clinical_effect": "Increased major bleeding risk",
        "management": "Dual therapy only when clearly indicated. Shortest duration possible.",
        "monitoring": "Clinical bleeding assessment, CBC",
        "rule_based": True,
    },
    
    # Serotonin syndrome combinations
    ("ssri", "tramadol"): {
        "severity": "Major",
        "mechanism": "Both increase serotonin levels",
        "clinical_effect": "Serotonin syndrome: agitation, hyperthermia, hyperreflexia, tremor",
        "management": "Use alternative analgesic if possible. Monitor closely if combined.",
        "monitoring": "Mental status, vitals, neuromuscular symptoms",
        "rule_based": True,
        "critical_alert": True,
    },
    ("ssri", "maoi"): {
        "severity": "Contraindicated",
        "mechanism": "Massive serotonin accumulation",
        "clinical_effect": "Life-threatening serotonin syndrome",
        "management": "CONTRAINDICATED. 2-week washout required between agents.",
        "monitoring": "Do not combine",
        "rule_based": True,
        "critical_alert": True,
    },
    ("linezolid", "ssri"): {
        "severity": "Contraindicated",
        "mechanism": "Linezolid has MAO-inhibitor activity",
        "clinical_effect": "Serotonin syndrome",
        "management": "Avoid combination. Use alternative antibiotic if possible.",
        "monitoring": "If unavoidable, close CNS monitoring",
        "rule_based": True,
        "critical_alert": True,
    },
    
    # Nephrotoxicity combinations
    ("nsaid", "acei"): {
        "severity": "Major",
        "mechanism": "NSAIDs reduce prostaglandin-mediated renal blood flow",
        "clinical_effect": "Acute kidney injury, reduced antihypertensive effect",
        "management": "Avoid NSAIDs in patients on ACEi. Use acetaminophen.",
        "monitoring": "Creatinine, BUN, blood pressure",
        "rule_based": True,
    },
    ("nsaid", "arb"): {
        "severity": "Major",
        "mechanism": "NSAIDs reduce prostaglandin-mediated renal blood flow",
        "clinical_effect": "Acute kidney injury, reduced antihypertensive effect",
        "management": "Avoid NSAIDs in patients on ARBs. Use acetaminophen.",
        "monitoring": "Creatinine, BUN, blood pressure",
        "rule_based": True,
    },
    ("aminoglycoside", "vancomycin"): {
        "severity": "Major",
        "mechanism": "Additive nephrotoxicity",
        "clinical_effect": "Increased risk of acute kidney injury",
        "management": "Monitor renal function closely. Adjust doses based on levels.",
        "monitoring": "Creatinine daily, drug levels, urine output",
        "rule_based": True,
    },
    
    # Hyperkalemia
    ("acei", "spironolactone"): {
        "severity": "Major",
        "mechanism": "Both increase serum potassium",
        "clinical_effect": "Life-threatening hyperkalemia",
        "management": "Use low-dose spironolactone (≤25mg). Avoid in renal impairment.",
        "monitoring": "Potassium at baseline, 1 week, 1 month, then periodically",
        "rule_based": True,
        "critical_alert": True,
    },
    ("arb", "potassium"): {
        "severity": "Major",
        "mechanism": "Additive hyperkalemia risk",
        "clinical_effect": "Cardiac arrhythmias from hyperkalemia",
        "management": "Avoid potassium supplements unless documented hypokalemia.",
        "monitoring": "Serum potassium, ECG if symptomatic",
        "rule_based": True,
    },
    
    # CNS depression
    ("opioid", "benzodiazepine"): {
        "severity": "Major",
        "mechanism": "Additive CNS and respiratory depression",
        "clinical_effect": "Respiratory depression, overdose death",
        "management": "Avoid combination. If essential, use lowest effective doses.",
        "monitoring": "Respiratory rate, sedation level, oxygen saturation",
        "rule_based": True,
        "critical_alert": True,
    },
    ("gabapentin", "opioid"): {
        "severity": "Major",
        "mechanism": "Additive CNS and respiratory depression",
        "clinical_effect": "Increased risk of respiratory depression",
        "management": "Start gabapentin at lower doses. Monitor closely.",
        "monitoring": "Respiratory status, sedation",
        "rule_based": True,
    },
    
    # Metformin combinations
    ("metformin", "contrast"): {
        "severity": "Major",
        "mechanism": "Contrast can cause renal impairment, increasing metformin accumulation",
        "clinical_effect": "Lactic acidosis (rare but potentially fatal)",
        "management": "Hold metformin before/after contrast. Resume after 48h if creatinine stable.",
        "monitoring": "Creatinine before and 48h after contrast",
        "rule_based": True,
    },
    
    # Digoxin interactions
    ("digoxin", "amiodarone"): {
        "severity": "Major",
        "mechanism": "Amiodarone inhibits P-glycoprotein, increasing digoxin levels",
        "clinical_effect": "Digoxin toxicity: arrhythmias, nausea, visual changes",
        "management": "Reduce digoxin dose by 50% when adding amiodarone.",
        "monitoring": "Digoxin levels, ECG, symptoms of toxicity",
        "rule_based": True,
    },
    ("digoxin", "verapamil"): {
        "severity": "Major",
        "mechanism": "Verapamil inhibits P-glycoprotein and renal clearance of digoxin",
        "clinical_effect": "Digoxin toxicity, bradycardia",
        "management": "Reduce digoxin dose. Avoid in patients with heart block.",
        "monitoring": "Digoxin levels, heart rate, ECG",
        "rule_based": True,
    },
    
    # Warfarin with calcium channel blockers
    ("warfarin", "amlodipine"): {
        "severity": "Minor",
        "mechanism": "Minimal interaction; amlodipine may have mild effect on warfarin metabolism",
        "clinical_effect": "Slight INR changes possible in some patients",
        "management": "Generally safe. Monitor INR when initiating or changing dose.",
        "monitoring": "INR at initiation and dose changes",
        "rule_based": True,
    },
    ("warfarin", "diltiazem"): {
        "severity": "Moderate",
        "mechanism": "Diltiazem inhibits CYP3A4, may increase warfarin levels",
        "clinical_effect": "Increased INR and bleeding risk",
        "management": "Monitor INR closely. May need warfarin dose reduction.",
        "monitoring": "INR weekly initially, then as stable",
        "rule_based": True,
    },
    
    # Warfarin with antibiotics
    ("warfarin", "ciprofloxacin"): {
        "severity": "Major",
        "mechanism": "Ciprofloxacin inhibits CYP1A2, increases warfarin effect",
        "clinical_effect": "Significantly elevated INR, bleeding risk",
        "management": "Use alternative antibiotic if possible. Monitor INR closely.",
        "monitoring": "INR every 2-3 days during therapy",
        "rule_based": True,
        "critical_alert": True,
    },
    ("warfarin", "metronidazole"): {
        "severity": "Major",
        "mechanism": "Metronidazole inhibits warfarin metabolism via CYP2C9",
        "clinical_effect": "Markedly elevated INR, high bleeding risk",
        "management": "Reduce warfarin dose by 25-50%. Consider alternative.",
        "monitoring": "INR every 2-3 days during therapy",
        "rule_based": True,
        "critical_alert": True,
    },
    ("warfarin", "amoxicillin"): {
        "severity": "Moderate",
        "mechanism": "Disruption of gut flora affecting vitamin K synthesis",
        "clinical_effect": "Possible INR increase",
        "management": "Monitor INR during antibiotic course.",
        "monitoring": "INR after 3-5 days of antibiotic",
        "rule_based": True,
    },
    
    # Statins with other drugs
    ("simvastatin", "amiodarone"): {
        "severity": "Major",
        "mechanism": "Amiodarone inhibits CYP3A4, increases simvastatin levels",
        "clinical_effect": "Increased risk of myopathy and rhabdomyolysis",
        "management": "Limit simvastatin to 20mg/day. Consider pravastatin.",
        "monitoring": "CK levels, muscle symptoms",
        "rule_based": True,
        "critical_alert": True,
    },
    ("statin", "clarithromycin"): {
        "severity": "Major",
        "mechanism": "Clarithromycin strongly inhibits CYP3A4",
        "clinical_effect": "Increased statin levels, myopathy risk",
        "management": "Hold statin during clarithromycin course or use azithromycin.",
        "monitoring": "Muscle symptoms, CK if symptomatic",
        "rule_based": True,
        "critical_alert": True,
    },
    
    # Metformin interactions
    ("metformin", "alcohol"): {
        "severity": "Major",
        "mechanism": "Both increase lactate production",
        "clinical_effect": "Increased risk of lactic acidosis",
        "management": "Advise limited alcohol intake. Avoid binge drinking.",
        "monitoring": "Lactate if symptomatic",
        "rule_based": True,
    },
    
    # Lithium interactions
    ("lithium", "nsaid"): {
        "severity": "Major",
        "mechanism": "NSAIDs reduce lithium clearance",
        "clinical_effect": "Lithium toxicity: tremor, ataxia, confusion",
        "management": "Avoid NSAIDs. Use acetaminophen for pain.",
        "monitoring": "Lithium levels if NSAID unavoidable",
        "rule_based": True,
        "critical_alert": True,
    },
    ("lithium", "acei"): {
        "severity": "Major",
        "mechanism": "ACE inhibitors reduce lithium clearance",
        "clinical_effect": "Elevated lithium levels, toxicity risk",
        "management": "Monitor lithium levels closely. May need dose reduction.",
        "monitoring": "Lithium levels weekly when starting ACEi",
        "rule_based": True,
    },
    ("lithium", "diuretic"): {
        "severity": "Major",
        "mechanism": "Thiazides and loop diuretics reduce lithium clearance",
        "clinical_effect": "Lithium toxicity",
        "management": "Avoid thiazides. Monitor closely with loop diuretics.",
        "monitoring": "Lithium levels, hydration status",
        "rule_based": True,
        "critical_alert": True,
    },
    
    # Potassium-sparing with potassium supplements
    ("potassium", "acei"): {
        "severity": "Major",
        "mechanism": "Additive hyperkalemia risk",
        "clinical_effect": "Cardiac arrhythmias from hyperkalemia",
        "management": "Avoid potassium supplements unless documented hypokalemia.",
        "monitoring": "Serum potassium, ECG if symptomatic",
        "rule_based": True,
    },
}

# =============================================================================
# COMBINED RISK CLUSTERS (for multi-drug analysis)
# =============================================================================

RISK_CLUSTERS = {
    "qt_prolongation": {
        "drugs": [
            "amiodarone", "sotalol", "dofetilide", "ibutilide", "quinidine",
            "procainamide", "droperidol", "haloperidol", "methadone",
            "erythromycin", "clarithromycin", "azithromycin", "moxifloxacin",
            "levofloxacin", "ciprofloxacin", "ondansetron", "domperidone",
            "citalopram", "escitalopram", "fluoxetine", "chlorpromazine",
        ],
        "risk": "QT prolongation / Torsades de Pointes",
        "monitoring": "ECG monitoring, avoid if QTc >500ms, check electrolytes",
        "severity": "Major",
    },
    "bleeding": {
        "drugs": [
            "warfarin", "heparin", "enoxaparin", "rivaroxaban", "apixaban",
            "dabigatran", "edoxaban", "aspirin", "clopidogrel", "prasugrel",
            "ticagrelor", "ibuprofen", "naproxen", "diclofenac", "ketorolac",
        ],
        "risk": "Increased bleeding risk",
        "monitoring": "Monitor for signs of bleeding, check INR/PT if applicable, CBC",
        "severity": "Major",
    },
    "serotonin_toxicity": {
        "drugs": [
            "ssri", "snri", "fluoxetine", "sertraline", "paroxetine",
            "citalopram", "escitalopram", "venlafaxine", "duloxetine",
            "tramadol", "fentanyl", "meperidine", "linezolid", "methylene blue",
            "triptans", "sumatriptan", "maoi", "st john",
        ],
        "risk": "Serotonin syndrome / toxicity",
        "monitoring": "Monitor for agitation, hyperthermia, hyperreflexia, tremor, diarrhea",
        "severity": "Major",
    },
    "cns_depression": {
        "drugs": [
            "benzodiazepine", "diazepam", "lorazepam", "alprazolam", "clonazepam",
            "opioid", "morphine", "oxycodone", "hydrocodone", "fentanyl", "codeine",
            "gabapentin", "pregabalin", "alcohol", "zolpidem", "eszopiclone",
        ],
        "risk": "Additive CNS depression / respiratory depression",
        "monitoring": "Monitor sedation level, respiratory rate, oxygen saturation",
        "severity": "Major",
    },
    "nephrotoxicity": {
        "drugs": [
            "nsaid", "ibuprofen", "naproxen", "diclofenac", "ketorolac", "celecoxib",
            "aminoglycoside", "gentamicin", "amikacin", "vancomycin",
            "acei", "arb", "lisinopril", "losartan", "contrast",
            "amphotericin", "cyclosporine", "tacrolimus", "cisplatin",
        ],
        "risk": "Nephrotoxicity / Acute kidney injury",
        "monitoring": "Monitor creatinine, BUN, urine output, avoid dehydration",
        "severity": "Major",
    },
    "hyperkalemia": {
        "drugs": [
            "acei", "arb", "lisinopril", "enalapril", "losartan", "valsartan",
            "spironolactone", "eplerenone", "amiloride", "triamterene",
            "potassium", "trimethoprim", "heparin",
        ],
        "risk": "Hyperkalemia",
        "monitoring": "Monitor serum potassium, ECG for cardiac effects (peaked T waves)",
        "severity": "Major",
    },
}


# =============================================================================
# LLM PROMPT TEMPLATES
# =============================================================================

INTERACTION_SYSTEM_PROMPT = """You are a clinical drug interaction analysis system.
Your task is to extract drug interaction information from medical textbook evidence.

CRITICAL RULES:
1. ONLY use information from the provided evidence chunks. DO NOT invent interactions.
2. If no interaction evidence is found for a drug pair, state "Not found in sources".
3. Be specific about mechanism, clinical effect, and management.
4. Severity levels: Contraindicated > Major > Moderate > Minor > None found
5. Format output as strict JSON matching the schema exactly.
6. Do not hallucinate interactions - only report what is in the evidence."""

INTERACTION_USER_PROMPT_TEMPLATE = """DRUGS TO CHECK: {drugs}
PATIENT CONTEXT:
- Age: {age}
- Pregnancy: {pregnancy}
- Renal status: {renal_status}
- Comorbidities: {comorbidities}

EVIDENCE CHUNKS (from drug references):
{evidence_text}

Analyze interactions between these drugs from ONLY the evidence above. Return strict JSON:
{{
  "drugs_normalized": [
    {{
      "input": "user input name",
      "resolved_generic": "generic name if resolved",
      "class": "drug class"
    }}
  ],
  "overall_risk_level": "Contraindicated|Major|Moderate|Minor|None found",
  "summary": "One paragraph clinical summary of key interaction concerns",
  "pairwise_interactions": [
    {{
      "drug_a": "first drug",
      "drug_b": "second drug",
      "severity": "Contraindicated|Major|Moderate|Minor|None found",
      "mechanism": "how the interaction occurs",
      "clinical_effect": "what happens clinically",
      "management": "what to do",
      "monitoring": "what to monitor",
      "evidence_chunk_ids": ["chunk_id"]
    }}
  ],
  "alternatives": [
    {{
      "for_drug": "drug with interaction",
      "alternative": "safer substitute if found in evidence",
      "reason": "why it's safer"
    }}
  ]
}}

If no evidence supports an interaction, use:
  "severity": "Not found in sources",
  "mechanism": "Not found in sources"
"""

FALLBACK_SYSTEM_PROMPT = """You are a clinical drug interaction assistant.
The user needs interaction information that was not found in their medical textbooks.

CRITICAL: All information you provide will be labeled as "LLM-GUIDED (VERIFY LOCALLY)"
because it is NOT from their indexed evidence. The doctor MUST verify this information.

Provide commonly accepted drug interaction information, including:
- Known clinically significant interactions
- Mechanism of interaction
- Management recommendations
- Monitoring parameters

Be conservative. Only report well-established interactions."""


# =============================================================================
# MAIN EXTRACTION FUNCTION
# =============================================================================

def extract_interactions_from_chunks(
    *,
    drugs: List[str],
    age: Optional[int] = None,
    pregnancy: Optional[str] = None,
    renal_status: Optional[str] = None,
    comorbidities: Optional[List[str]] = None,
    chunks: List[Dict[str, Any]],
    debug: bool = False,
) -> Dict[str, Any]:
    """
    Extract structured drug interactions with evidence-first approach.
    
    Includes rule-based critical interaction alerts that are ALWAYS applied
    for patient safety, regardless of RAG results.
    
    Returns dual-mode response with source labels for every interaction.
    """
    if not drugs or len(drugs) < 2:
        return _empty_interaction_response(drugs, "Need at least 2 drugs to check interactions")
    
    # =======================================================================
    # STEP 1: Use Evidence Gap Resolver for enhanced retrieval
    # =======================================================================
    context = {
        "age": age,
        "pregnancy": pregnancy,
        "renal_status": renal_status,
        "comorbidities": comorbidities,
    }
    
    resolver_result = resolve_interaction_evidence(
        drugs=drugs,
        context=context,
    )
    
    # =======================================================================
    # STEP 2: ALWAYS apply rule-based critical interactions (patient safety)
    # =======================================================================
    rule_based_interactions = _check_critical_interactions(drugs)
    rule_based_risks = _check_combined_risks(drugs)
    
    # =======================================================================
    # STEP 3: Extract evidence-based content from resolved chunks
    # =======================================================================
    evidence_based = _extract_from_rag(
        drugs=drugs,
        chunks=resolver_result.best_chunks,
        context=context,
    )
    
    # =======================================================================
    # STEP 4: Check if fallback needed
    # =======================================================================
    fallback_needed = _needs_fallback(evidence_based, resolver_result, rule_based_interactions)
    
    llm_guided = None
    if fallback_needed:
        llm_guided = _generate_interaction_fallback(
            drugs=drugs,
            context=context,
            evidence_based=evidence_based,
            rule_based_interactions=rule_based_interactions,
        )
    
    # =======================================================================
    # STEP 5: Build complete dual-mode response
    # =======================================================================
    result = _build_dual_mode_response(
        drugs=drugs,
        evidence_based=evidence_based,
        llm_guided=llm_guided,
        rule_based_interactions=rule_based_interactions,
        rule_based_risks=rule_based_risks,
        resolver_result=resolver_result,
        chunks=resolver_result.best_chunks,
    )
    
    if debug:
        result["debug"] = {
            "llm_model": LLM_MODEL,
            "resolver_coverage": resolver_result.coverage_status.value,
            "fallback_triggered": fallback_needed,
            "rule_based_alerts": len(rule_based_interactions),
            "rule_based_risks": len(rule_based_risks),
            "evidence_chunk_count": len(resolver_result.best_chunks),
        }
    
    return result


def _check_critical_interactions(drugs: List[str]) -> List[Dict[str, Any]]:
    """Check for critical interactions from rule-based library."""
    interactions = []
    drugs_lower = [d.lower().strip() for d in drugs]
    
    # Drug class mappings for matching
    class_mappings = {
        "ssri": ["fluoxetine", "sertraline", "paroxetine", "citalopram", "escitalopram", "fluvoxamine"],
        "maoi": ["phenelzine", "tranylcypromine", "isocarboxazid", "selegiline", "rasagiline"],
        "nsaid": ["ibuprofen", "naproxen", "diclofenac", "ketorolac", "indomethacin", "celecoxib", "meloxicam"],
        "acei": ["lisinopril", "enalapril", "ramipril", "captopril", "benazepril", "perindopril"],
        "arb": ["losartan", "valsartan", "irbesartan", "candesartan", "telmisartan", "olmesartan"],
        "opioid": ["morphine", "oxycodone", "hydrocodone", "fentanyl", "codeine", "tramadol", "methadone", "hydromorphone"],
        "benzodiazepine": ["diazepam", "lorazepam", "alprazolam", "clonazepam", "midazolam", "temazepam"],
        "fluoroquinolone": ["ciprofloxacin", "levofloxacin", "moxifloxacin", "ofloxacin", "norfloxacin"],
        "aminoglycoside": ["gentamicin", "amikacin", "tobramycin", "streptomycin", "neomycin"],
    }
    
    def drug_matches(drug: str, pattern: str) -> bool:
        """Check if a drug matches a pattern (exact or class)."""
        if pattern in drug or drug in pattern:
            return True
        # Check class mappings
        if pattern in class_mappings:
            return any(member in drug for member in class_mappings[pattern])
        return False
    
    # Check all pairs
    for (pattern_a, pattern_b), interaction_data in CRITICAL_INTERACTIONS.items():
        for drug_a in drugs_lower:
            for drug_b in drugs_lower:
                if drug_a == drug_b:
                    continue
                if drug_matches(drug_a, pattern_a) and drug_matches(drug_b, pattern_b):
                    # Found a match
                    interaction = {
                        "pair": [drug_a, drug_b],
                        "severity": interaction_data["severity"],
                        "mechanism": interaction_data["mechanism"],
                        "clinical_effect": interaction_data["clinical_effect"],
                        "management": interaction_data["management"],
                        "monitoring": interaction_data["monitoring"],
                        "rule_based": True,
                        "critical_alert": interaction_data.get("critical_alert", False),
                        "source_label": "RULE-BASED (CRITICAL SAFETY)",
                    }
                    # Avoid duplicates
                    if not any(
                        set(i["pair"]) == set([drug_a, drug_b]) 
                        for i in interactions
                    ):
                        interactions.append(interaction)
    
    return interactions


def _check_combined_risks(drugs: List[str]) -> List[Dict[str, Any]]:
    """Check for combined risk clusters based on drug list."""
    risks = []
    drugs_lower = [d.lower() for d in drugs]
    
    for cluster_name, cluster_info in RISK_CLUSTERS.items():
        cluster_drugs = cluster_info["drugs"]
        matched = []
        
        for drug in drugs_lower:
            for cluster_drug in cluster_drugs:
                if cluster_drug in drug or drug in cluster_drug:
                    matched.append(drug)
                    break
        
        if len(matched) >= 2:
            risks.append({
                "risk_type": cluster_name.replace("_", " ").title(),
                "explanation": cluster_info["risk"],
                "implicated_drugs": list(set(matched)),
                "monitoring": cluster_info["monitoring"],
                "severity": cluster_info["severity"],
                "rule_based": True,
                "source_label": "RULE-BASED (COMBINED RISK)",
            })
    
    return risks


def _extract_from_rag(
    drugs: List[str],
    chunks: List[Dict[str, Any]],
    context: Dict[str, Any],
) -> Dict[str, Any]:
    """Extract interactions from RAG chunks only."""
    if not chunks:
        return {"empty": True}
    
    # Build evidence text
    evidence_blocks = []
    for i, chunk in enumerate(chunks[:20]):
        chunk_id = chunk.get("chunk_id") or f"chunk_{i}"
        text = chunk.get("text") or ""
        book = chunk.get("book") or chunk.get("book_id") or "Unknown"
        page = chunk.get("page_start") or ""
        
        evidence_blocks.append(
            f"[CHUNK {chunk_id}] (Source: {book}, p{page})\n{text[:1500]}"
        )
    
    evidence_text = "\n\n---\n\n".join(evidence_blocks) or "No evidence chunks available."
    
    user_prompt = INTERACTION_USER_PROMPT_TEMPLATE.format(
        drugs=", ".join(drugs),
        age=context.get("age") or "Not specified",
        pregnancy=context.get("pregnancy") or "Not specified",
        renal_status=context.get("renal_status") or "Not specified",
        comorbidities=", ".join(context.get("comorbidities") or []) or "None",
        evidence_text=evidence_text,
    )
    
    try:
        llm = _get_llm()
        resp = llm.chat.completions.create(
            model=LLM_MODEL,
            temperature=0.1,
            messages=[
                {"role": "system", "content": INTERACTION_SYSTEM_PROMPT},
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
    rule_based_interactions: List[Dict[str, Any]],
) -> bool:
    """Check if LLM fallback is needed."""
    # If we have rule-based interactions, those provide core safety info
    # Only need fallback if we have neither evidence nor rule-based interactions
    if rule_based_interactions:
        # We have safety coverage, fallback only if explicitly allowed for more detail
        return resolver_result.fallback_allowed and resolver_result.coverage_status == CoverageStatus.INSUFFICIENT_FINAL
    
    # No rule-based interactions found, check evidence
    if evidence_based.get("error") or evidence_based.get("empty"):
        return resolver_result.fallback_allowed
    
    pairwise = evidence_based.get("pairwise_interactions") or []
    if not pairwise:
        return resolver_result.fallback_allowed
    
    return False


def _generate_interaction_fallback(
    drugs: List[str],
    context: Dict[str, Any],
    evidence_based: Dict[str, Any],
    rule_based_interactions: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Generate LLM-guided fallback content."""
    prompt = f"""Drugs: {', '.join(drugs)}
Patient context: {json.dumps(context)}

Rule-based interactions already identified: {len(rule_based_interactions)}
Evidence-based interactions found: {len(evidence_based.get('pairwise_interactions') or [])}

Provide any additional significant drug interactions not covered by the above.
Focus on clinically important interactions only.

Return JSON with pairwise_interactions and alternatives."""

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
            # Mark all interactions as LLM-guided
            for interaction in result.get("pairwise_interactions") or []:
                interaction["source_label"] = SourceLabel.LLM_GUIDED.value
                interaction["rule_based"] = False
            return result
    except Exception:
        pass
    
    return {"pairwise_interactions": [], "alternatives": []}


def _build_dual_mode_response(
    drugs: List[str],
    evidence_based: Dict[str, Any],
    llm_guided: Optional[Dict[str, Any]],
    rule_based_interactions: List[Dict[str, Any]],
    rule_based_risks: List[Dict[str, Any]],
    resolver_result: ResolverResult,
    chunks: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Build complete dual-mode response with source labels."""
    
    # Drugs normalized
    drugs_normalized = evidence_based.get("drugs_normalized") or [
        {"input": d, "resolved_generic": d, "class": ""}
        for d in drugs
    ]
    
    # Collect all interactions (rule-based first, then evidence, then LLM)
    all_interactions = []
    seen_pairs = set()
    
    # 1. Rule-based critical interactions (highest priority)
    for interaction in rule_based_interactions:
        pair_key = frozenset(interaction["pair"])
        if pair_key not in seen_pairs:
            seen_pairs.add(pair_key)
            all_interactions.append(interaction)
    
    # 2. Evidence-based interactions
    for pw in evidence_based.get("pairwise_interactions") or []:
        pair = [pw.get("drug_a") or "", pw.get("drug_b") or ""]
        pair_key = frozenset(pair)
        if pair_key not in seen_pairs:
            seen_pairs.add(pair_key)
            all_interactions.append({
                "pair": pair,
                "severity": pw.get("severity") or "Not found",
                "mechanism": pw.get("mechanism") or "Not found in sources",
                "clinical_effect": pw.get("clinical_effect") or "",
                "management": pw.get("management") or "",
                "monitoring": pw.get("monitoring") or "",
                "citations": pw.get("evidence_chunk_ids") or [],
                "rule_based": False,
                "source_label": SourceLabel.EVIDENCE_BASED.value,
            })
    
    # 3. LLM-guided interactions (fill gaps only)
    if llm_guided:
        for pw in llm_guided.get("pairwise_interactions") or []:
            pair = [pw.get("drug_a") or "", pw.get("drug_b") or ""]
            pair_key = frozenset(pair)
            if pair_key not in seen_pairs:
                seen_pairs.add(pair_key)
                all_interactions.append({
                    "pair": pair,
                    "severity": pw.get("severity") or "Unknown",
                    "mechanism": pw.get("mechanism") or "LLM-guided",
                    "clinical_effect": pw.get("clinical_effect") or "",
                    "management": pw.get("management") or "",
                    "monitoring": pw.get("monitoring") or "",
                    "citations": [],
                    "rule_based": False,
                    "source_label": SourceLabel.LLM_GUIDED.value,
                })
    
    # Combined risks (rule-based)
    combined_risks = rule_based_risks
    
    # Determine overall risk level
    overall_risk = "Low"
    if any(i.get("severity") == "Contraindicated" for i in all_interactions):
        overall_risk = "Contraindicated"
    elif any(i.get("severity") == "Major" for i in all_interactions):
        overall_risk = "Major"
    elif any(i.get("severity") == "Moderate" for i in all_interactions):
        overall_risk = "Moderate"
    elif any(i.get("severity") == "Minor" for i in all_interactions):
        overall_risk = "Minor"
    
    # Check for critical alerts
    critical_alerts = [
        i for i in all_interactions 
        if i.get("critical_alert") or i.get("severity") == "Contraindicated"
    ]
    
    # Summary
    summary = evidence_based.get("summary") or ""
    if critical_alerts:
        alert_summary = f"CRITICAL: {len(critical_alerts)} contraindicated or critical interaction(s) identified. "
        summary = alert_summary + summary
    
    # Monitoring recommendations
    monitoring = []
    for interaction in all_interactions:
        if interaction.get("monitoring"):
            monitoring.append(interaction["monitoring"])
    for risk in combined_risks:
        if risk.get("monitoring"):
            monitoring.append(risk["monitoring"])
    monitoring = list(dict.fromkeys(monitoring))[:10]  # Dedupe and limit
    
    if not monitoring:
        monitoring = ["Monitor for adverse effects as clinically indicated"]
    
    # Alternatives
    alternatives = []
    for alt in (evidence_based.get("alternatives") or []) + (llm_guided or {}).get("alternatives", []):
        if alt.get("alternative") and "not found" not in alt.get("alternative", "").lower():
            alternatives.append({
                "for_drug": alt.get("for_drug", ""),
                "alternative": alt.get("alternative", ""),
                "reason": alt.get("reason", ""),
                "source_label": SourceLabel.EVIDENCE_BASED.value if alt in (evidence_based.get("alternatives") or []) else SourceLabel.LLM_GUIDED.value,
            })
    
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
    has_content = bool(all_interactions) or bool(combined_risks)
    coverage_gate = {
        "passed": has_content,
        "evidence_coverage": resolver_result.coverage_status.value,
        "fallback_used": llm_guided is not None,
        "rule_based_coverage": len(rule_based_interactions) > 0,
    }
    
    # LLM guided warning
    llm_guided_warning = None
    if llm_guided and any(i.get("source_label") == SourceLabel.LLM_GUIDED.value for i in all_interactions):
        llm_guided_warning = (
            "NOTICE: SOME CONTENT IS LLM-GUIDED: Interactions marked 'LLM-GUIDED (VERIFY LOCALLY)' "
            "are not from your indexed textbooks. Verify with local drug references."
        )
    
    return {
        "drugs": drugs,
        "drugs_resolved": drugs_normalized,
        "overall_risk_level": overall_risk,
        "critical_alerts": critical_alerts,
        "summary": summary,
        "interactions": all_interactions,
        "combined_risks": combined_risks,
        "monitoring": monitoring,
        "safer_alternatives": alternatives,
        "evidence": evidence,
        "coverage_gate": coverage_gate,
        "llm_guided_warning": llm_guided_warning,
    }


def _empty_interaction_response(drugs: List[str], reason: str) -> Dict[str, Any]:
    """Return empty response with explanation."""
    return {
        "drugs": drugs,
        "drugs_resolved": [{"input": d, "resolved_generic": d} for d in drugs],
        "overall_risk_level": "Not assessed",
        "critical_alerts": [],
        "summary": reason,
        "interactions": [],
        "combined_risks": [],
        "monitoring": [],
        "safer_alternatives": [],
        "evidence": [],
        "coverage_gate": {
            "passed": False, 
            "evidence_coverage": "insufficient",
            "missing_chunk_ids": ["insufficient_drugs"],
        },
        "llm_guided_warning": None,
    }
