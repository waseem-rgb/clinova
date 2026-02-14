# backend/app/workspace/models.py
"""
Pydantic models for Clinical Workspace.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
import uuid


class WorkspaceContext(BaseModel):
    """
    Patient/case context that carries forward across all features.
    """
    # Demographics
    age: Optional[int] = None
    sex: Optional[str] = None  # "male" | "female" | "unknown"
    pregnancy: Optional[str] = None  # "yes" | "no" | "unknown"
    
    # Clinical presentation
    symptoms: Optional[str] = None
    duration: Optional[str] = None
    severity: Optional[str] = None  # "mild" | "moderate" | "severe"
    setting: Optional[str] = None  # "OPD" | "ER" | "ICU" | "Ward"
    
    # Patient history
    comorbidities: List[str] = Field(default_factory=list)
    allergies: List[str] = Field(default_factory=list)
    current_meds: List[str] = Field(default_factory=list)
    
    # Organ function
    renal_status: Optional[str] = None  # "normal" | "CKD stage 3" etc.
    hepatic_status: Optional[str] = None  # "normal" | "cirrhosis Child-Pugh B" etc.
    
    # Working diagnoses (selected from DDx)
    active_condition: Optional[str] = None
    selected_ddx: List[str] = Field(default_factory=list)
    
    # Selected drugs (from Treatment/Drug pages)
    selected_drugs: List[str] = Field(default_factory=list)
    
    # Lab abnormalities (from Lab page)
    lab_abnormalities: List[str] = Field(default_factory=list)


class WorkspaceOutputs(BaseModel):
    """
    Cached outputs from each feature.
    """
    ddx_result: Optional[Dict[str, Any]] = None
    treatment_result: Optional[Dict[str, Any]] = None
    drug_detail_cache: Dict[str, Any] = Field(default_factory=dict)  # {drug_name: result}
    interaction_result: Optional[Dict[str, Any]] = None
    lab_result: Optional[Dict[str, Any]] = None


class WorkspaceCase(BaseModel):
    """
    Full workspace case model.
    """
    case_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    context: WorkspaceContext = Field(default_factory=WorkspaceContext)
    outputs: WorkspaceOutputs = Field(default_factory=WorkspaceOutputs)
    
    # Last action taken (for handoff tracking)
    last_action: Optional[str] = None  # e.g., "ddx_to_treatment", "drug_to_interactions"


class WorkspaceCreateResponse(BaseModel):
    """
    Response when creating a new workspace case.
    """
    case_id: str
    created_at: datetime
    context: WorkspaceContext
    outputs: WorkspaceOutputs


class WorkspacePatchRequest(BaseModel):
    """
    Partial update request for workspace.
    """
    context: Optional[Dict[str, Any]] = None
    outputs: Optional[Dict[str, Any]] = None


class WorkspaceHandoffRequest(BaseModel):
    """
    Handoff action request.
    """
    action: str  # e.g., "ddx_to_treatment", "treatment_to_drug", "drug_to_interactions"
    active_condition: Optional[str] = None
    selected_ddx: Optional[List[str]] = None
    selected_drugs: Optional[List[str]] = None
    target_feature: str  # "ddx" | "treatment" | "drug" | "interactions" | "lab"


class WorkspaceListItem(BaseModel):
    """
    Summary item for listing cases.
    """
    case_id: str
    created_at: datetime
    updated_at: datetime
    active_condition: Optional[str] = None
    symptoms_preview: Optional[str] = None
