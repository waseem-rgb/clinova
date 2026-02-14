# backend/app/workspace/router.py
"""
REST API endpoints for Clinical Workspace.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel

from .models import (
    WorkspaceCase,
    WorkspaceCreateResponse,
    WorkspacePatchRequest,
    WorkspaceHandoffRequest,
    WorkspaceListItem,
)
from .store import get_store

router = APIRouter(prefix="/workspace", tags=["workspace"])


def _get_client_id(x_client_id: Optional[str] = Header(None, alias="X-Client-Id")) -> Optional[str]:
    """Extract client ID from header."""
    return x_client_id


@router.post("/new", response_model=WorkspaceCreateResponse)
async def create_new_case(
    x_client_id: Optional[str] = Header(None, alias="X-Client-Id"),
) -> WorkspaceCreateResponse:
    """
    Create a new workspace case.
    
    The X-Client-Id header is used to associate the case with a specific client
    for multi-device support.
    
    Returns:
        New case with case_id, created_at, and initial empty context/outputs.
    """
    store = get_store()
    case = store.create_case(client_id=x_client_id)
    
    return WorkspaceCreateResponse(
        case_id=case.case_id,
        created_at=case.created_at,
        context=case.context,
        outputs=case.outputs,
    )


@router.get("/last", response_model=WorkspaceCase)
async def get_last_case(
    x_client_id: Optional[str] = Header(None, alias="X-Client-Id"),
) -> WorkspaceCase:
    """
    Get the most recently updated case for this client.
    
    Requires X-Client-Id header to identify the client.
    
    Returns:
        The most recent workspace case, or 404 if none found.
    """
    if not x_client_id:
        raise HTTPException(
            status_code=400,
            detail="X-Client-Id header required for /last endpoint",
        )
    
    store = get_store()
    case = store.get_last_case(client_id=x_client_id)
    
    if not case:
        raise HTTPException(
            status_code=404,
            detail=f"No workspace case found for client {x_client_id}",
        )
    
    return case


@router.get("/{case_id}", response_model=WorkspaceCase)
async def get_case(case_id: str) -> WorkspaceCase:
    """
    Get a workspace case by ID.
    
    Args:
        case_id: The case identifier
        
    Returns:
        The full workspace case, or 404 if not found.
    """
    store = get_store()
    case = store.get_case(case_id)
    
    if not case:
        raise HTTPException(
            status_code=404,
            detail=f"Workspace case {case_id} not found",
        )
    
    return case


@router.patch("/{case_id}", response_model=WorkspaceCase)
async def update_case(
    case_id: str,
    patch: WorkspacePatchRequest,
) -> WorkspaceCase:
    """
    Partially update a workspace case.
    
    Merges the provided context and outputs with existing data.
    
    Args:
        case_id: The case identifier
        patch: Partial context and/or outputs to merge
        
    Returns:
        The updated workspace case.
    """
    store = get_store()
    
    case = store.update_case(
        case_id=case_id,
        context_updates=patch.context,
        outputs_updates=patch.outputs,
    )
    
    if not case:
        raise HTTPException(
            status_code=404,
            detail=f"Workspace case {case_id} not found",
        )
    
    return case


@router.post("/{case_id}/handoff", response_model=WorkspaceCase)
async def handoff_action(
    case_id: str,
    handoff: WorkspaceHandoffRequest,
) -> WorkspaceCase:
    """
    Record a handoff action and update case context.
    
    This is a convenience endpoint for common cross-feature actions like:
    - "ddx_to_treatment": Set active_condition from selected DDx
    - "treatment_to_drug": Add drug to selected_drugs
    - "drug_to_interactions": Prepare for interaction check
    
    Args:
        case_id: The case identifier
        handoff: The handoff action details
        
    Returns:
        The updated workspace case.
    """
    store = get_store()
    
    # Build context updates based on handoff
    context_updates = {}
    
    if handoff.active_condition:
        context_updates["active_condition"] = handoff.active_condition
    
    if handoff.selected_ddx:
        # Get existing case to merge lists
        existing = store.get_case(case_id)
        if existing:
            existing_ddx = set(existing.context.selected_ddx)
            existing_ddx.update(handoff.selected_ddx)
            context_updates["selected_ddx"] = list(existing_ddx)
    
    if handoff.selected_drugs:
        # Get existing case to merge lists
        existing = store.get_case(case_id)
        if existing:
            existing_drugs = set(existing.context.selected_drugs)
            existing_drugs.update(handoff.selected_drugs)
            context_updates["selected_drugs"] = list(existing_drugs)
    
    case = store.update_case(
        case_id=case_id,
        context_updates=context_updates if context_updates else None,
        last_action=handoff.action,
    )
    
    if not case:
        raise HTTPException(
            status_code=404,
            detail=f"Workspace case {case_id} not found",
        )
    
    return case


@router.delete("/{case_id}")
async def delete_case(case_id: str) -> dict:
    """
    Delete a workspace case.
    
    Args:
        case_id: The case identifier
        
    Returns:
        Success message.
    """
    store = get_store()
    deleted = store.delete_case(case_id)
    
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=f"Workspace case {case_id} not found",
        )
    
    return {"status": "deleted", "case_id": case_id}


@router.get("/", response_model=list)
async def list_cases(
    x_client_id: Optional[str] = Header(None, alias="X-Client-Id"),
    limit: int = Query(20, ge=1, le=100),
) -> list:
    """
    List workspace cases for this client.
    
    Args:
        x_client_id: Optional client filter (from header)
        limit: Maximum number of cases to return
        
    Returns:
        List of workspace case summaries.
    """
    store = get_store()
    cases = store.list_cases(client_id=x_client_id, limit=limit)
    
    return [
        WorkspaceListItem(
            case_id=c.case_id,
            created_at=c.created_at,
            updated_at=c.updated_at,
            active_condition=c.context.active_condition,
            symptoms_preview=c.context.symptoms[:50] if c.context.symptoms else None,
        )
        for c in cases
    ]
