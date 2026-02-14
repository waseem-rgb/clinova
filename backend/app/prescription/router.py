"""
Prescription Router - FastAPI endpoints for Prescription Studio.

Provides all API endpoints for the prescription system:
- Draft CRUD operations
- Transcript parsing
- Inline suggestions
- Safety checks
- Prescription locking
- PDF generation and download
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import FileResponse

from .models import (
    PrescriptionDraft, PrescriptionStatus,
    Doctor, Patient, Visit, Diagnosis, RxItem,
    SafetyAlert, SafetyOverride,
    CreateDraftRequest, UpdateDraftRequest,
    ParseRequest, SuggestRequest, SuggestResponse,
    SafetyCheckRequest, SafetyCheckResponse,
    LockRequest, LockResponse, PDFResponse
)
from .store import save_draft, get_draft, delete_draft, list_drafts, draft_exists
from .parser import parse_transcript
from .suggest import get_suggestions
from .safety import run_safety_checks
from .pdf import generate_pdf, save_pdf, get_pdf_path, lock_prescription, generate_prescription_hash


router = APIRouter(prefix="/prescription", tags=["Prescription Studio"])


# ============================================================
# Draft CRUD Endpoints
# ============================================================

@router.post("/draft", response_model=dict)
async def create_draft(request: CreateDraftRequest):
    """
    Create a new prescription draft.
    
    Returns the created draft with generated ID.
    """
    visit = request.visit or Visit(datetime=datetime.utcnow())
    diagnosis = request.diagnosis or Diagnosis()
    
    draft = PrescriptionDraft(
        doctor=request.doctor,
        patient=request.patient,
        visit=visit,
        diagnosis=diagnosis,
        transcript=request.transcript
    )
    
    saved = save_draft(draft)
    return saved.dict()


@router.get("/draft/{draft_id}", response_model=dict)
async def get_draft_by_id(draft_id: str):
    """
    Get a prescription draft by ID.
    """
    draft = get_draft(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft.dict()


@router.put("/draft/{draft_id}", response_model=dict)
async def update_draft(draft_id: str, request: UpdateDraftRequest):
    """
    Update an existing prescription draft.
    
    Only drafts (not locked prescriptions) can be updated.
    Partial updates are supported - only provided fields are updated.
    """
    draft = get_draft(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    if draft.status == PrescriptionStatus.LOCKED:
        raise HTTPException(status_code=400, detail="Cannot update a locked prescription")
    
    # Update provided fields
    if request.doctor is not None:
        draft.doctor = request.doctor
    if request.patient is not None:
        draft.patient = request.patient
    if request.visit is not None:
        draft.visit = request.visit
    if request.diagnosis is not None:
        draft.diagnosis = request.diagnosis
    if request.rx_items is not None:
        draft.rx_items = request.rx_items
    if request.investigations is not None:
        draft.investigations = request.investigations
    if request.advice is not None:
        draft.advice = request.advice
    if request.follow_up is not None:
        draft.follow_up = request.follow_up
    if request.safety_overrides is not None:
        draft.safety_overrides = request.safety_overrides
    if request.notes is not None:
        draft.notes = request.notes
    if request.transcript is not None:
        draft.transcript = request.transcript
    
    saved = save_draft(draft)
    return saved.dict()


@router.delete("/draft/{draft_id}")
async def delete_draft_by_id(draft_id: str):
    """
    Delete a prescription draft.
    
    Only drafts (not locked prescriptions) can be deleted.
    """
    if not draft_exists(draft_id):
        raise HTTPException(status_code=404, detail="Draft not found")
    
    try:
        deleted = delete_draft(draft_id)
        if deleted:
            return {"success": True, "message": "Draft deleted"}
        raise HTTPException(status_code=500, detail="Failed to delete draft")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/drafts", response_model=dict)
async def list_all_drafts(
    status: Optional[str] = None,
    doctor_name: Optional[str] = None,
    patient_name: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """
    List prescription drafts with optional filters.
    """
    status_enum = None
    if status:
        try:
            status_enum = PrescriptionStatus(status)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    
    drafts = list_drafts(
        status=status_enum,
        doctor_name=doctor_name,
        patient_name=patient_name,
        limit=limit,
        offset=offset
    )
    
    return {
        "drafts": [d.dict() for d in drafts],
        "count": len(drafts),
        "limit": limit,
        "offset": offset
    }


# ============================================================
# Parse Endpoint
# ============================================================

@router.post("/parse", response_model=dict)
async def parse_text(request: ParseRequest):
    """
    Parse free-form text (from voice dictation or typing) into structured prescription data.
    
    This uses deterministic regex patterns to extract:
    - Complaints
    - Diagnosis
    - Medications
    - Investigations
    - Advice
    - Follow-up
    
    NO hallucination: Only extracts what is explicitly present in the text.
    """
    result = parse_transcript(request.text)
    return result


# ============================================================
# Suggestion Endpoint
# ============================================================

@router.post("/suggest", response_model=SuggestResponse)
async def suggest(request: SuggestRequest):
    """
    Get inline suggestions for a prescription field.
    
    Supports fields:
    - drug: Drug name suggestions (generic + Indian brands)
    - frequency: OD, BD, TDS, etc.
    - duration: 5 days, 1 week, etc.
    - timing: Before food, after food, etc.
    - route: Oral, IV, IM, etc.
    - form: Tab, Cap, Syr, etc.
    - instruction: Additional instructions
    - diagnosis: Common diagnoses
    
    Returns suggestions sorted by relevance to input text.
    """
    suggestions = get_suggestions(
        field=request.field,
        text=request.text,
        limit=request.limit,
        context=request.context
    )
    
    return SuggestResponse(suggestions=suggestions)


# ============================================================
# Safety Check Endpoint
# ============================================================

@router.post("/safety/check", response_model=SafetyCheckResponse)
async def check_safety(request: SafetyCheckRequest):
    """
    Run safety checks on a prescription.
    
    Checks include:
    - Duplicate medications
    - NSAID + Anticoagulant interaction
    - Multiple NSAIDs/Antiplatelets
    - ACE-I/ARB + K-sparing diuretic
    - Dual RAAS blockade
    - QT prolongation risk
    - CNS depression risk
    - Serotonin syndrome risk
    - Age-related considerations
    
    Returns only HIGH-SIGNAL alerts to avoid alert fatigue.
    """
    alerts, overall_risk = run_safety_checks(
        rx_items=request.rx_items,
        patient=request.patient,
        existing_alerts=request.existing_alerts
    )
    
    return SafetyCheckResponse(
        alerts=alerts,
        overall_risk=overall_risk
    )


@router.post("/draft/{draft_id}/safety", response_model=dict)
async def run_safety_for_draft(draft_id: str):
    """
    Run safety checks on an existing draft and update it with alerts.
    """
    draft = get_draft(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    alerts, overall_risk = run_safety_checks(
        rx_items=draft.rx_items,
        patient=draft.patient,
        existing_alerts=draft.safety_alerts
    )
    
    # Update draft with new alerts
    existing_ids = {a.id for a in draft.safety_alerts}
    for alert in alerts:
        if alert.id not in existing_ids:
            draft.safety_alerts.append(alert)
    
    saved = save_draft(draft)
    
    return {
        "alerts": [a.dict() for a in saved.safety_alerts],
        "overall_risk": overall_risk,
        "draft_id": draft_id
    }


# ============================================================
# Lock Endpoint
# ============================================================

@router.post("/lock/{draft_id}", response_model=LockResponse)
async def lock_draft(draft_id: str, request: LockRequest):
    """
    Lock a prescription draft.
    
    Locking:
    1. Validates all required fields are present
    2. Generates a tamper-evident hash
    3. Generates the PDF
    4. Marks the prescription as locked (immutable)
    
    A locked prescription cannot be edited or deleted.
    """
    if not request.confirm:
        raise HTTPException(
            status_code=400, 
            detail="Must confirm lock by setting confirm=true"
        )
    
    draft = get_draft(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    locked_draft, errors = lock_prescription(draft)
    
    if errors:
        return LockResponse(success=False, errors=errors)
    
    # Save the locked draft
    save_draft(locked_draft)
    
    return LockResponse(
        success=True,
        hash=locked_draft.lock.hash if locked_draft.lock else None
    )


@router.get("/draft/{draft_id}/validate", response_model=dict)
async def validate_draft(draft_id: str):
    """
    Validate if a draft can be locked.
    
    Returns validation status and any errors.
    """
    draft = get_draft(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    can_lock, errors = draft.can_lock()
    
    return {
        "draft_id": draft_id,
        "can_lock": can_lock,
        "errors": errors,
        "status": draft.status.value
    }


# ============================================================
# PDF Endpoints
# ============================================================

@router.post("/pdf/{draft_id}", response_model=PDFResponse)
async def generate_pdf_for_draft(draft_id: str):
    """
    Generate a PDF for a prescription draft (preview mode).
    
    This generates the PDF without locking the prescription.
    Use the lock endpoint for final prescription with hash.
    """
    draft = get_draft(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    pdf_bytes, error = generate_pdf(draft)
    
    if error:
        return PDFResponse(success=False, errors=[error])
    
    pdf_path = save_pdf(draft, pdf_bytes)
    
    return PDFResponse(success=True, pdf_path=pdf_path)


@router.get("/pdf/{draft_id}/download")
async def download_pdf(draft_id: str):
    """
    Download the PDF for a prescription.
    
    For locked prescriptions, returns the official locked PDF.
    For drafts, generates a preview PDF.
    """
    draft = get_draft(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    # Check if PDF already exists (for locked prescriptions)
    pdf_path = get_pdf_path(draft_id)
    
    if pdf_path and pdf_path.exists():
        return FileResponse(
            path=pdf_path,
            filename=f"prescription_{draft_id}.pdf",
            media_type="application/pdf"
        )
    
    # Generate PDF on the fly
    pdf_bytes, error = generate_pdf(draft)
    if error:
        raise HTTPException(status_code=500, detail=error)
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=prescription_{draft_id}.pdf"
        }
    )


@router.get("/pdf/{draft_id}/preview")
async def preview_pdf(draft_id: str):
    """
    Preview PDF inline (Content-Disposition: inline).
    """
    draft = get_draft(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    pdf_bytes, error = generate_pdf(draft)
    if error:
        raise HTTPException(status_code=500, detail=error)
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename=prescription_{draft_id}.pdf"
        }
    )


# ============================================================
# Utility Endpoints
# ============================================================

@router.get("/hash/{draft_id}")
async def get_prescription_hash(draft_id: str):
    """
    Get the hash for a prescription.
    
    For locked prescriptions, returns the stored hash.
    For drafts, calculates the current hash (will change if draft is modified).
    """
    draft = get_draft(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    if draft.lock:
        return {
            "hash": draft.lock.hash,
            "locked": True,
            "locked_at": draft.lock.locked_at.isoformat()
        }
    
    current_hash = generate_prescription_hash(draft)
    return {
        "hash": current_hash,
        "locked": False,
        "note": "This hash will change if the draft is modified"
    }


@router.post("/draft/{draft_id}/override", response_model=dict)
async def add_safety_override(draft_id: str, override: SafetyOverride):
    """
    Add a safety override to a draft.
    
    The doctor must provide a reason (min 10 characters) when overriding
    a safety alert.
    """
    draft = get_draft(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    if draft.status == PrescriptionStatus.LOCKED:
        raise HTTPException(status_code=400, detail="Cannot modify a locked prescription")
    
    # Verify the alert exists
    alert_exists = any(a.id == override.alert_id for a in draft.safety_alerts)
    if not alert_exists:
        raise HTTPException(status_code=400, detail=f"Alert {override.alert_id} not found")
    
    # Check if already overridden
    already_overridden = any(o.alert_id == override.alert_id for o in draft.safety_overrides)
    if already_overridden:
        raise HTTPException(status_code=400, detail="Alert already overridden")
    
    # Add override
    draft.safety_overrides.append(override)
    saved = save_draft(draft)
    
    return {
        "success": True,
        "override": override.dict(),
        "total_overrides": len(saved.safety_overrides)
    }
