# Doctor-grade fixes: narrative filter + urine qual severity + B12 normalization + HDL low + DM severity
# backend/app/api/schemas.py
from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# =========================
# Shared / Monograph schemas
# =========================

class EvidenceItem(BaseModel):
    book: str
    collection: str
    snippet: str

    page: Optional[int] = None
    chapter: Optional[str] = None
    section: Optional[str] = None
    chunk_id: Optional[str] = None
    score: Optional[float] = None
    meta: Dict[str, Any] = Field(default_factory=dict)


class SectionOut(BaseModel):
    title: str
    content_md: str
    evidence: List[EvidenceItem] = Field(default_factory=list)


class DoctorMonographResponse(BaseModel):
    feature: str
    query: str
    collection: str

    # doctor UI (no citations inside)
    doctor_view_md: str

    # optional structured sections
    sections: List[SectionOut] = Field(default_factory=list)

    # collapsible evidence (global)
    evidence: List[EvidenceItem] = Field(default_factory=list)

    # dev-only optional debug
    debug: Optional[Dict[str, Any]] = None


# =========================
# Lab schemas (Parse + Analyze)
# =========================

class LabKeyAbnormality(BaseModel):
    test: str
    panel: str
    value: Any
    unit: Optional[str] = None
    severity: str
    note: Optional[str] = None


class LabLikelyPattern(BaseModel):
    title: str
    severity_tag: str


class LabExecutiveSummary(BaseModel):
    key_abnormalities: List[LabKeyAbnormality] = Field(default_factory=list)
    likely_patterns: List[LabLikelyPattern] = Field(default_factory=list)


class LabAbnormality(BaseModel):
    panel: str
    test: str
    result: Any
    unit: Optional[str] = None
    range: Optional[str] = None
    flag: Optional[str] = None
    severity: str
    notes: Optional[str] = None


class LabPatternEvidence(BaseModel):
    book: str
    chapter: Optional[str] = None
    page: Optional[int] = None
    snippet: str


class LabPatternInvestigation(BaseModel):
    test: str
    why: str
    what_it_helps: str


class LabPattern(BaseModel):
    title: str
    summary: str
    likely_conditions: List[str] = Field(default_factory=list)
    red_flags: List[str] = Field(default_factory=list)
    next_investigations: List[LabPatternInvestigation] = Field(default_factory=list)
    evidence: Optional[List[LabPatternEvidence]] = None


class LabCoverage(BaseModel):
    all_addressed: bool
    missing: List[str] = Field(default_factory=list)


class LabDebug(BaseModel):
    pages: Optional[int] = None
    extraction_method_stats: Dict[str, Any] = Field(default_factory=dict)
    range_parse_examples: List[Dict[str, Any]] = Field(default_factory=list)
    garbage_dropped_examples: List[Dict[str, Any]] = Field(default_factory=list)
    counts: Dict[str, Any] = Field(default_factory=dict)
    sample_dropped_narrative_lines: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class LabAnalyzeResponse(BaseModel):
    executive_summary: LabExecutiveSummary = Field(default_factory=LabExecutiveSummary)
    abnormalities: List[LabAbnormality] = Field(default_factory=list)
    patterns: List[LabPattern] = Field(default_factory=list)
    coverage: LabCoverage
    extracted_tests: List[Dict[str, Any]] = Field(default_factory=list)
    extracted_tests_count: int = 0
    abnormalities_count: int = 0
    debug: Optional[LabDebug] = None


# =========================
# DDX / Tx / Drugs / Interactions / Rx schemas
# =========================

class EvidenceRef(BaseModel):
    chunk_id: Optional[str] = None
    book: Optional[str] = None
    chapter: Optional[str] = None
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    snippet: Optional[str] = None


class DDxInput(BaseModel):
    symptoms: str
    duration: Optional[str] = None
    vitals: Optional[Dict[str, Any]] = None
    age: Optional[int] = None
    sex: Optional[str] = None
    pregnancy: Optional[str] = None
    comorbidities: Optional[List[str]] = None
    meds: Optional[List[str]] = None
    red_flags: Optional[List[str]] = None


class DDxMustNotMiss(BaseModel):
    diagnosis: str
    key_clues: List[str] = Field(default_factory=list)
    immediate_actions: List[str] = Field(default_factory=list)
    evidence_ids: List[str] = Field(default_factory=list)


class DDxRankedItem(BaseModel):
    diagnosis: str
    likelihood: str
    for_: List[str] = Field(default_factory=list, alias="for")
    against: List[str] = Field(default_factory=list)
    discriminating_tests: List[str] = Field(default_factory=list)
    initial_management: List[str] = Field(default_factory=list)
    evidence_ids: List[str] = Field(default_factory=list)


class DDxSystemItem(BaseModel):
    diagnosis: str
    key_points: List[str] = Field(default_factory=list)
    evidence_ids: List[str] = Field(default_factory=list)


class DDxSystemGroup(BaseModel):
    system: str
    items: List[DDxSystemItem] = Field(default_factory=list)


class DDxDiagnosticAlgorithm(BaseModel):
    step_1: List[str] = Field(default_factory=list)
    step_2: List[str] = Field(default_factory=list)
    step_3: List[str] = Field(default_factory=list)


class DDxInvestigations(BaseModel):
    urgent: List[str] = Field(default_factory=list)
    soon: List[str] = Field(default_factory=list)
    routine: List[str] = Field(default_factory=list)


class DDxEvidenceSource(BaseModel):
    title: Optional[str] = None
    section: Optional[str] = None
    page_start: Optional[int] = None
    page_end: Optional[int] = None


class DDxEvidence(BaseModel):
    id: str
    snippet: str
    source: DDxEvidenceSource


class DDxCoverageGate(BaseModel):
    passed: bool
    missing_evidence_ids: List[str] = Field(default_factory=list)


class DDxResponse(BaseModel):
    input_summary: Dict[str, Any]
    must_not_miss: List[DDxMustNotMiss] = Field(default_factory=list)
    ranked_ddx: List[DDxRankedItem] = Field(default_factory=list)
    system_wise: List[DDxSystemGroup] = Field(default_factory=list)
    rapid_algorithm: DDxDiagnosticAlgorithm = Field(default_factory=DDxDiagnosticAlgorithm)
    suggested_investigations: DDxInvestigations = Field(default_factory=DDxInvestigations)
    red_flags: List[str] = Field(default_factory=list)
    evidence: List[DDxEvidence] = Field(default_factory=list)
    coverage_gate: DDxCoverageGate
    debug: Optional[Dict[str, Any]] = None


class TreatmentContext(BaseModel):
    age: Optional[int] = None
    sex: Optional[str] = None
    pregnancy: Optional[str] = None
    duration: Optional[str] = None
    severity: Optional[str] = None
    setting: Optional[str] = None
    allergies: Optional[List[str]] = None
    comorbidities: Optional[List[str]] = None
    renal_status: Optional[str] = None
    hepatic_status: Optional[str] = None
    current_meds: Optional[List[str]] = None


class TreatmentInput(BaseModel):
    topic_or_diagnosis: str
    context: Optional[TreatmentContext] = None
    confirmed_diagnosis: Optional[bool] = None
    source: Optional[str] = None


class DrugPlan(BaseModel):
    generic: str
    dose: str
    route: str
    frequency: str
    duration: str
    weight_based: Optional[bool] = None
    renal_adjustment: Optional[str] = None
    hepatic_adjustment: Optional[str] = None
    pregnancy_notes: Optional[str] = None
    key_contraindications: List[str] = Field(default_factory=list)
    monitoring: List[str] = Field(default_factory=list)


class Regimen(BaseModel):
    label: str
    indication_notes: str
    drugs: List[DrugPlan] = Field(default_factory=list)


class InteractionFlag(BaseModel):
    drug: str
    message: str


class BrandSuggestion(BaseModel):
    generic: str
    brand_names: List[str] = Field(default_factory=list)
    strengths: List[str] = Field(default_factory=list)
    forms: List[str] = Field(default_factory=list)
    price_notes: Optional[str] = None
    source: str
    evidence_chunk_ids: List[str] = Field(default_factory=list)


class TreatmentEvidenceChunk(BaseModel):
    chunk_id: str
    excerpt: str
    book_id: Optional[str] = None
    section_path: Optional[str] = None
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    score: Optional[float] = None


class TreatmentEvidence(BaseModel):
    chunks: List[TreatmentEvidenceChunk] = Field(default_factory=list)
    coverage: Dict[str, Any] = Field(default_factory=dict)


class TreatmentAdvisorResponse(BaseModel):
    topic: str
    summary_plan: List[str] = Field(default_factory=list)
    first_line_regimens: List[Regimen] = Field(default_factory=list)
    second_line_regimens: List[Regimen] = Field(default_factory=list)
    supportive_care: List[str] = Field(default_factory=list)
    contraindications_and_cautions: List[str] = Field(default_factory=list)
    monitoring: List[str] = Field(default_factory=list)
    drug_interactions_flags: List[InteractionFlag] = Field(default_factory=list)
    red_flags_urgent_referral: List[str] = Field(default_factory=list)
    follow_up: List[str] = Field(default_factory=list)
    brands_india: List[BrandSuggestion] = Field(default_factory=list)
    evidence: TreatmentEvidence = Field(default_factory=TreatmentEvidence)
    debug: Optional[Dict[str, Any]] = None


class DrugMonographResponse(BaseModel):
    drug_name: str
    indications: List[Dict[str, Any]] = Field(default_factory=list)
    dosage: List[Dict[str, Any]] = Field(default_factory=list)
    contraindications: List[Dict[str, Any]] = Field(default_factory=list)
    warnings_precautions: List[Dict[str, Any]] = Field(default_factory=list)
    pregnancy_lactation: List[Dict[str, Any]] = Field(default_factory=list)
    adverse_effects: List[Dict[str, Any]] = Field(default_factory=list)
    interactions_summary: List[Dict[str, Any]] = Field(default_factory=list)
    monitoring: List[Dict[str, Any]] = Field(default_factory=list)
    evidence: List[EvidenceRef] = Field(default_factory=list)
    coverage_gate: Dict[str, Any]
    clean_read_blocks: Optional[List[Dict[str, Any]]] = None
    debug: Optional[Dict[str, Any]] = None


class DrugSuggestion(BaseModel):
    display: str
    input: str
    canonical: str
    type: str


class DrugSearchResponse(BaseModel):
    query: str
    suggestions: List[DrugSuggestion] = Field(default_factory=list)


class DrugResolveResponse(BaseModel):
    query: str
    canonical: str
    matched: str
    confidence: float


class DrugHeader(BaseModel):
    canonical_generic_name: str
    common_brand_names: List[str] = Field(default_factory=list)
    drug_class: Optional[str] = None
    quick_flags: List[str] = Field(default_factory=list)


class DrugCard(BaseModel):
    title: str
    value: str
    severity_tag: Optional[str] = None


class DrugSection(BaseModel):
    key: str
    title: str
    bullets: List[str] = Field(default_factory=list)
    citations: List[str] = Field(default_factory=list)
    notes: Optional[str] = None


class BrandPriceRow(BaseModel):
    brand: str
    manufacturer: Optional[str] = None
    strength: Optional[str] = None
    form: Optional[str] = None
    pack: Optional[str] = None
    price: Optional[str] = None
    source: Optional[str] = None


class DrugDetailsResponse(BaseModel):
    header: DrugHeader
    executive_summary_cards: List[DrugCard] = Field(default_factory=list)
    sections: List[DrugSection] = Field(default_factory=list)
    brands_and_prices: Dict[str, Any] = Field(default_factory=dict)
    evidence: List[EvidenceRef] = Field(default_factory=list)
    coverage_gate: Dict[str, Any]
    debug: Optional[Dict[str, Any]] = None


class InteractionResponse(BaseModel):
    drugs: List[str]
    overall_risk_level: str
    interactions: List[Dict[str, Any]] = Field(default_factory=list)
    monitoring: List[str] = Field(default_factory=list)
    safer_alternatives: List[str] = Field(default_factory=list)
    evidence: List[EvidenceRef] = Field(default_factory=list)
    coverage_gate: Dict[str, Any]
    clean_read_blocks: Optional[List[Dict[str, Any]]] = None
    debug: Optional[Dict[str, Any]] = None


class RxStudioResponse(BaseModel):
    transcript: str
    soap: Optional[Dict[str, Any]] = None
    prescription: Optional[Dict[str, Any]] = None
    warnings: List[Dict[str, Any]] = Field(default_factory=list)
    audit_trail: Dict[str, Any] = Field(default_factory=dict)
    disclaimer_text: str
