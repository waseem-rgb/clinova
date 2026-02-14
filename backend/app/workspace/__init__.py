# backend/app/workspace/__init__.py
"""
Clinical Workspace Module

Provides server-side session persistence for clinical cases,
enabling multi-device sync and cross-feature data sharing.
"""

from .models import (
    WorkspaceContext,
    WorkspaceOutputs,
    WorkspaceCase,
    WorkspaceCreateResponse,
    WorkspacePatchRequest,
    WorkspaceHandoffRequest,
)
from .store import WorkspaceStore
from .router import router

__all__ = [
    "WorkspaceContext",
    "WorkspaceOutputs",
    "WorkspaceCase",
    "WorkspaceCreateResponse",
    "WorkspacePatchRequest",
    "WorkspaceHandoffRequest",
    "WorkspaceStore",
    "router",
]
