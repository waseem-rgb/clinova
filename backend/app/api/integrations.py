# backend/app/api/integrations.py
"""
External Integration API for Clinova.

These endpoints allow external projects (like Health Bridge) to access
Clinova's clinical features through a stable, API-key-protected interface.

All endpoints require the X-Clinova-Key header with a valid API key.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, Field

from app.api.auth import log_integration_request, require_api_key
from app.services.ddx import run_ddx
from app.services.drugs_details import get_drug_details
from app.services.interactions import check_interactions
from app.services.rxstudio import build_rx_draft
from app.services.topics import get_topic
from app.services.treatment import get_treatment_advice

router = APIRouter(
    prefix="/integrations",
    tags=["integrations"],
    dependencies=[Depends(require_api_key)],
)


# =========================
# Pydantic Models for Integration API
# =========================

class PatientContext(BaseModel):
    """Patient demographic and clinical context."""
    age: Optional[int] = None
    sex: Optional[str] = None
    pregnancy: Optional[str] = None
    weight_kg: Optional[float] = None


class EncounterContext(BaseModel):
    """
    Standard context object for integration requests.
    
    Fields:
        project: Identifier for the calling project (e.g., "health_bridge")
        user_id: Optional user/session identifier from calling project
        patient: Patient demographics (age, sex, etc.)
        chief_complaint: Primary reason for encounter
        history: Relevant medical history
        exam: Physical examination findings
        vitals: Vital signs as key-value pairs
        labs: List of lab results (strings or dicts)
        meds: Current medications
        allergies: Known allergies
        comorbidities: Existing conditions
        query: Search query for topic/drug lookups
    """
    project: str = Field(..., description="Calling project identifier (e.g., 'health_bridge')")
    user_id: Optional[str] = Field(None, description="Optional user/session ID from calling project")
    patient: Optional[PatientContext] = None
    chief_complaint: Optional[str] = None
    history: Optional[str] = None
    exam: Optional[str] = None
    vitals: Optional[Dict[str, Any]] = None
    labs: Optional[List[Any]] = Field(default_factory=list)
    meds: Optional[List[str]] = Field(default_factory=list)
    allergies: Optional[List[str]] = Field(default_factory=list)
    comorbidities: Optional[List[str]] = Field(default_factory=list)
    query: Optional[str] = Field(None, description="Search query for topic/drug lookups")
    
    # DDx-specific fields
    symptoms: Optional[str] = None
    duration: Optional[str] = None
    red_flags: Optional[List[str]] = Field(default_factory=list)
    
    # Treatment-specific fields
    diagnosis: Optional[str] = None
    severity: Optional[str] = None
    setting: Optional[str] = None
    confirmed_diagnosis: Optional[bool] = None
    
    # Drug-specific fields
    drug_name: Optional[str] = None
    drugs: Optional[List[str]] = Field(default_factory=list)
    
    # Rx-specific fields
    transcript: Optional[str] = None
    intent: Optional[str] = "both"


class IntegrationHealthResponse(BaseModel):
    """Health check response."""
    ok: bool = True
    service: str = "clinova"
    version: str = "1.0.0"


class IntegrationResponse(BaseModel):
    """
    Standard wrapper for integration responses.
    """
    success: bool = True
    project: str
    data: Dict[str, Any]
    timing_ms: int = 0


def _wrap_response(project: str, data: Dict[str, Any], start_time: float) -> IntegrationResponse:
    """Wrap service response in standard integration format."""
    timing_ms = int((time.time() - start_time) * 1000)
    return IntegrationResponse(
        success=True,
        project=project,
        data=data,
        timing_ms=timing_ms,
    )


def _log_and_respond(request: Request, response: Response, status_code: int = 200):
    """Log integration request after processing."""
    log_integration_request(request, status_code)


# =========================
# Health Check Endpoint
# =========================

@router.get("/health", response_model=IntegrationHealthResponse)
async def integration_health(request: Request, response: Response):
    """
    Health check for integration API.
    
    Returns simple status to confirm API key is valid and service is up.
    """
    _log_and_respond(request, response, 200)
    return IntegrationHealthResponse()


# =========================
# Topic Retrieval
# =========================

@router.post("/topic")
async def integration_topic(
    ctx: EncounterContext,
    request: Request,
    response: Response,
    debug: bool = Query(False),
):
    """
    Retrieve medical topic information.
    
    Uses the same topic retrieval pipeline as the Clinova UI.
    
    Required fields in ctx:
        - query: The topic to search for (e.g., "pneumonia", "diabetes mellitus")
    """
    start_time = time.time()
    
    topic_query = ctx.query or ctx.chief_complaint or "medicine"
    result = await get_topic(topic_query, debug=debug)
    
    _log_and_respond(request, response, 200)
    return _wrap_response(ctx.project, result, start_time)


# =========================
# Differential Diagnosis
# =========================

@router.post("/ddx")
async def integration_ddx(
    ctx: EncounterContext,
    request: Request,
    response: Response,
    debug: bool = Query(False),
):
    """
    Run differential diagnosis analysis.
    
    Uses the same DDx pipeline as the Clinova UI.
    
    Recommended fields in ctx:
        - symptoms or chief_complaint: Primary symptoms to analyze
        - duration: Duration of symptoms
        - patient.age, patient.sex: Demographics
        - vitals: Vital signs
        - meds: Current medications
        - comorbidities: Existing conditions
        - red_flags: Concerning symptoms
    """
    start_time = time.time()
    
    # Build DDx input from encounter context
    ddx_input = {
        "symptoms": ctx.symptoms or ctx.chief_complaint or "",
        "duration": ctx.duration,
        "vitals": ctx.vitals,
        "age": ctx.patient.age if ctx.patient else None,
        "sex": ctx.patient.sex if ctx.patient else None,
        "pregnancy": ctx.patient.pregnancy if ctx.patient else None,
        "comorbidities": ctx.comorbidities or [],
        "meds": ctx.meds or [],
        "red_flags": ctx.red_flags or [],
    }
    
    result = run_ddx(ddx_input, debug=debug)
    
    _log_and_respond(request, response, 200)
    return _wrap_response(ctx.project, result, start_time)


# =========================
# Treatment Advisor
# =========================

@router.post("/treatment")
async def integration_treatment(
    ctx: EncounterContext,
    request: Request,
    response: Response,
    debug: bool = Query(False),
):
    """
    Get treatment advice for a diagnosis or condition.
    
    Uses the same Treatment Advisor pipeline as the Clinova UI.
    
    Recommended fields in ctx:
        - diagnosis or query: The condition to get treatment for
        - patient.age, patient.sex: Demographics
        - severity: mild/moderate/severe
        - setting: outpatient/inpatient/icu
        - allergies: Drug allergies
        - comorbidities: Existing conditions
        - meds: Current medications
    """
    start_time = time.time()
    
    # Build treatment input from encounter context
    treatment_input = {
        "topic_or_diagnosis": ctx.diagnosis or ctx.query or ctx.chief_complaint or "",
        "context": {
            "age": ctx.patient.age if ctx.patient else None,
            "sex": ctx.patient.sex if ctx.patient else None,
            "pregnancy": ctx.patient.pregnancy if ctx.patient else None,
            "duration": ctx.duration,
            "severity": ctx.severity,
            "setting": ctx.setting,
            "allergies": ctx.allergies or [],
            "comorbidities": ctx.comorbidities or [],
            "current_meds": ctx.meds or [],
        },
        "confirmed_diagnosis": ctx.confirmed_diagnosis,
    }
    
    result = get_treatment_advice(treatment_input, debug=debug)
    
    _log_and_respond(request, response, 200)
    return _wrap_response(ctx.project, result, start_time)


# =========================
# Drug Details
# =========================

@router.post("/drug")
async def integration_drug(
    ctx: EncounterContext,
    request: Request,
    response: Response,
    debug: bool = Query(False),
):
    """
    Get detailed drug information.
    
    Uses the same Drug Details pipeline as the Clinova UI.
    
    Required fields in ctx:
        - drug_name or query: Name of the drug to look up
    """
    start_time = time.time()
    
    drug_name = ctx.drug_name or ctx.query or ""
    if not drug_name:
        return IntegrationResponse(
            success=False,
            project=ctx.project,
            data={"error": "drug_name or query is required"},
            timing_ms=int((time.time() - start_time) * 1000),
        )
    
    result = get_drug_details(drug_name, debug=debug)
    
    _log_and_respond(request, response, 200)
    return _wrap_response(ctx.project, result, start_time)


# =========================
# Drug Interactions
# =========================

@router.post("/interactions")
async def integration_interactions(
    ctx: EncounterContext,
    request: Request,
    response: Response,
    debug: bool = Query(False),
):
    """
    Check drug-drug interactions.
    
    Uses the same Interactions pipeline as the Clinova UI.
    
    Required fields in ctx:
        - drugs: List of drug names to check for interactions
        
    Optional context for better analysis:
        - patient.age, patient.sex: Demographics
        - comorbidities: May affect interaction severity
    """
    start_time = time.time()
    
    drugs_list = ctx.drugs or ctx.meds or []
    if len(drugs_list) < 2:
        return IntegrationResponse(
            success=False,
            project=ctx.project,
            data={"error": "At least 2 drugs required for interaction check"},
            timing_ms=int((time.time() - start_time) * 1000),
        )
    
    # Build interaction request
    interaction_input = {
        "drugs": drugs_list,
        "context": {
            "age": ctx.patient.age if ctx.patient else None,
            "sex": ctx.patient.sex if ctx.patient else None,
            "comorbidities": ctx.comorbidities or [],
        },
    }
    
    result = check_interactions(interaction_input, debug=debug)
    
    _log_and_respond(request, response, 200)
    return _wrap_response(ctx.project, result, start_time)


# =========================
# Prescription Studio (Rx)
# =========================

@router.post("/rx")
async def integration_rx(
    ctx: EncounterContext,
    request: Request,
    response: Response,
):
    """
    Generate prescription draft from clinical transcript.
    
    Uses the same RxStudio pipeline as the Clinova UI.
    
    Required fields in ctx:
        - transcript: Clinical encounter transcript or notes
        
    Optional fields:
        - patient: Patient demographics for dose adjustments
        - intent: "soap" | "prescription" | "both" (default: "both")
    """
    start_time = time.time()
    
    transcript = ctx.transcript or ""
    if not transcript:
        return IntegrationResponse(
            success=False,
            project=ctx.project,
            data={"error": "transcript is required"},
            timing_ms=int((time.time() - start_time) * 1000),
        )
    
    # Build Rx request
    rx_input = {
        "transcript": transcript,
        "patient": {
            "age": ctx.patient.age if ctx.patient else None,
            "sex": ctx.patient.sex if ctx.patient else None,
            "weight_kg": ctx.patient.weight_kg if ctx.patient else None,
        } if ctx.patient else None,
        "intent": ctx.intent or "both",
    }
    
    result = build_rx_draft(rx_input)
    
    _log_and_respond(request, response, 200)
    return _wrap_response(ctx.project, result, start_time)
