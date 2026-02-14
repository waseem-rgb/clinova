"""
Prescription Store - JSON file-based storage for prescription drafts.

Simple file-based storage that persists prescriptions to JSON files.
Each prescription is stored as a separate file for easy access and debugging.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from .models import PrescriptionDraft, PrescriptionStatus


# Storage directory
STORE_DIR = Path(__file__).resolve().parents[1] / "data" / "prescriptions"


def _ensure_store_dir():
    """Ensure the store directory exists"""
    STORE_DIR.mkdir(parents=True, exist_ok=True)


def _draft_path(draft_id: str) -> Path:
    """Get the file path for a draft"""
    return STORE_DIR / f"{draft_id}.json"


def _serialize_draft(draft: PrescriptionDraft) -> dict:
    """Serialize a draft to JSON-compatible dict"""
    data = draft.dict()
    # Convert datetime objects to ISO strings
    data["created_at"] = draft.created_at.isoformat()
    data["updated_at"] = draft.updated_at.isoformat()
    if draft.visit:
        data["visit"]["datetime"] = draft.visit.datetime.isoformat()
    if draft.lock:
        data["lock"]["locked_at"] = draft.lock.locked_at.isoformat()
    for override in data.get("safety_overrides", []):
        if isinstance(override.get("overridden_at"), datetime):
            override["overridden_at"] = override["overridden_at"].isoformat()
    return data


def _deserialize_draft(data: dict) -> PrescriptionDraft:
    """Deserialize a dict to PrescriptionDraft"""
    # Convert ISO strings back to datetime
    if isinstance(data.get("created_at"), str):
        data["created_at"] = datetime.fromisoformat(data["created_at"])
    if isinstance(data.get("updated_at"), str):
        data["updated_at"] = datetime.fromisoformat(data["updated_at"])
    if data.get("visit") and isinstance(data["visit"].get("datetime"), str):
        data["visit"]["datetime"] = datetime.fromisoformat(data["visit"]["datetime"])
    if data.get("lock") and isinstance(data["lock"].get("locked_at"), str):
        data["lock"]["locked_at"] = datetime.fromisoformat(data["lock"]["locked_at"])
    for override in data.get("safety_overrides", []):
        if isinstance(override.get("overridden_at"), str):
            override["overridden_at"] = datetime.fromisoformat(override["overridden_at"])
    return PrescriptionDraft(**data)


def save_draft(draft: PrescriptionDraft) -> PrescriptionDraft:
    """
    Save a prescription draft to storage.
    Updates the updated_at timestamp.
    Returns the saved draft.
    """
    _ensure_store_dir()
    draft.updated_at = datetime.utcnow()
    
    path = _draft_path(draft.id)
    data = _serialize_draft(draft)
    
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    return draft


def get_draft(draft_id: str) -> Optional[PrescriptionDraft]:
    """
    Retrieve a prescription draft by ID.
    Returns None if not found.
    """
    path = _draft_path(draft_id)
    if not path.exists():
        return None
    
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    
    return _deserialize_draft(data)


def delete_draft(draft_id: str) -> bool:
    """
    Delete a prescription draft.
    Returns True if deleted, False if not found.
    Only drafts (not locked) can be deleted.
    """
    draft = get_draft(draft_id)
    if not draft:
        return False
    
    if draft.status == PrescriptionStatus.LOCKED:
        raise ValueError("Cannot delete a locked prescription")
    
    path = _draft_path(draft_id)
    path.unlink()
    return True


def list_drafts(
    status: Optional[PrescriptionStatus] = None,
    doctor_name: Optional[str] = None,
    patient_name: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
) -> List[PrescriptionDraft]:
    """
    List prescription drafts with optional filters.
    Returns newest first.
    """
    _ensure_store_dir()
    
    drafts = []
    for path in STORE_DIR.glob("*.json"):
        try:
            with path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            draft = _deserialize_draft(data)
            
            # Apply filters
            if status and draft.status != status:
                continue
            if doctor_name and doctor_name.lower() not in draft.doctor.name.lower():
                continue
            if patient_name and patient_name.lower() not in draft.patient.name.lower():
                continue
            
            drafts.append(draft)
        except Exception:
            # Skip invalid files
            continue
    
    # Sort by updated_at descending
    drafts.sort(key=lambda d: d.updated_at, reverse=True)
    
    # Apply pagination
    return drafts[offset:offset + limit]


def count_drafts(
    status: Optional[PrescriptionStatus] = None,
    doctor_name: Optional[str] = None,
    patient_name: Optional[str] = None
) -> int:
    """Count drafts matching filters"""
    return len(list_drafts(status=status, doctor_name=doctor_name, patient_name=patient_name, limit=10000))


def draft_exists(draft_id: str) -> bool:
    """Check if a draft exists"""
    return _draft_path(draft_id).exists()
