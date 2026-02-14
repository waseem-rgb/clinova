# backend/app/workspace/store.py
"""
SQLite-based persistence for Clinical Workspace cases.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import List, Optional
import uuid

from .models import WorkspaceCase, WorkspaceContext, WorkspaceOutputs


# Default database path (same directory as other data)
DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "workspace.sqlite3"


class WorkspaceStore:
    """
    SQLite store for workspace cases.
    """
    
    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or DEFAULT_DB_PATH
        self._ensure_db()
    
    def _get_conn(self) -> sqlite3.Connection:
        """Get a database connection with row factory."""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn
    
    def _ensure_db(self) -> None:
        """Ensure database and tables exist."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        
        conn = self._get_conn()
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS workspace_cases (
                    case_id TEXT PRIMARY KEY,
                    client_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    context_json TEXT NOT NULL DEFAULT '{}',
                    outputs_json TEXT NOT NULL DEFAULT '{}',
                    last_action TEXT
                )
            """)
            
            # Index for fast client_id lookups
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_workspace_client_id 
                ON workspace_cases(client_id)
            """)
            
            # Index for sorting by updated_at
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_workspace_updated_at 
                ON workspace_cases(updated_at DESC)
            """)
            
            conn.commit()
        finally:
            conn.close()
    
    def create_case(self, client_id: Optional[str] = None) -> WorkspaceCase:
        """
        Create a new workspace case.
        
        Args:
            client_id: Optional client identifier for multi-device support
            
        Returns:
            The newly created WorkspaceCase
        """
        case = WorkspaceCase(
            case_id=str(uuid.uuid4()),
            client_id=client_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            context=WorkspaceContext(),
            outputs=WorkspaceOutputs(),
        )
        
        conn = self._get_conn()
        try:
            conn.execute(
                """
                INSERT INTO workspace_cases 
                (case_id, client_id, created_at, updated_at, context_json, outputs_json, last_action)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    case.case_id,
                    case.client_id,
                    case.created_at.isoformat(),
                    case.updated_at.isoformat(),
                    case.context.model_dump_json(),
                    case.outputs.model_dump_json(),
                    case.last_action,
                ),
            )
            conn.commit()
        finally:
            conn.close()
        
        return case
    
    def get_case(self, case_id: str) -> Optional[WorkspaceCase]:
        """
        Get a workspace case by ID.
        
        Args:
            case_id: The case identifier
            
        Returns:
            WorkspaceCase if found, None otherwise
        """
        conn = self._get_conn()
        try:
            row = conn.execute(
                "SELECT * FROM workspace_cases WHERE case_id = ?",
                (case_id,),
            ).fetchone()
            
            if not row:
                return None
            
            return self._row_to_case(row)
        finally:
            conn.close()
    
    def get_last_case(self, client_id: str) -> Optional[WorkspaceCase]:
        """
        Get the most recently updated case for a client.
        
        Args:
            client_id: The client identifier
            
        Returns:
            Most recent WorkspaceCase if found, None otherwise
        """
        conn = self._get_conn()
        try:
            row = conn.execute(
                """
                SELECT * FROM workspace_cases 
                WHERE client_id = ? 
                ORDER BY updated_at DESC 
                LIMIT 1
                """,
                (client_id,),
            ).fetchone()
            
            if not row:
                return None
            
            return self._row_to_case(row)
        finally:
            conn.close()
    
    def update_case(
        self,
        case_id: str,
        context_updates: Optional[dict] = None,
        outputs_updates: Optional[dict] = None,
        last_action: Optional[str] = None,
    ) -> Optional[WorkspaceCase]:
        """
        Update a workspace case with partial data.
        
        Args:
            case_id: The case identifier
            context_updates: Partial context updates to merge
            outputs_updates: Partial outputs updates to merge
            last_action: Optional action to record
            
        Returns:
            Updated WorkspaceCase if found, None otherwise
        """
        # Get existing case
        case = self.get_case(case_id)
        if not case:
            return None
        
        # Merge context updates
        if context_updates:
            existing_context = case.context.model_dump()
            # Handle list fields specially - append rather than replace if requested
            for key, value in context_updates.items():
                if key in ("comorbidities", "allergies", "current_meds", "selected_ddx", "selected_drugs", "lab_abnormalities"):
                    if isinstance(value, list):
                        # If value starts with "+", append; otherwise replace
                        existing_context[key] = value
                else:
                    existing_context[key] = value
            case.context = WorkspaceContext(**existing_context)
        
        # Merge outputs updates
        if outputs_updates:
            existing_outputs = case.outputs.model_dump()
            for key, value in outputs_updates.items():
                if key == "drug_detail_cache" and isinstance(value, dict):
                    # Merge drug cache
                    existing_outputs[key].update(value)
                else:
                    existing_outputs[key] = value
            case.outputs = WorkspaceOutputs(**existing_outputs)
        
        # Update metadata
        case.updated_at = datetime.utcnow()
        if last_action:
            case.last_action = last_action
        
        # Save to database
        conn = self._get_conn()
        try:
            conn.execute(
                """
                UPDATE workspace_cases 
                SET context_json = ?, outputs_json = ?, updated_at = ?, last_action = ?
                WHERE case_id = ?
                """,
                (
                    case.context.model_dump_json(),
                    case.outputs.model_dump_json(),
                    case.updated_at.isoformat(),
                    case.last_action,
                    case_id,
                ),
            )
            conn.commit()
        finally:
            conn.close()
        
        return case
    
    def delete_case(self, case_id: str) -> bool:
        """
        Delete a workspace case.
        
        Args:
            case_id: The case identifier
            
        Returns:
            True if deleted, False if not found
        """
        conn = self._get_conn()
        try:
            cursor = conn.execute(
                "DELETE FROM workspace_cases WHERE case_id = ?",
                (case_id,),
            )
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()
    
    def list_cases(
        self,
        client_id: Optional[str] = None,
        limit: int = 20,
    ) -> List[WorkspaceCase]:
        """
        List workspace cases, optionally filtered by client.
        
        Args:
            client_id: Optional client filter
            limit: Maximum number of cases to return
            
        Returns:
            List of WorkspaceCase objects
        """
        conn = self._get_conn()
        try:
            if client_id:
                rows = conn.execute(
                    """
                    SELECT * FROM workspace_cases 
                    WHERE client_id = ? 
                    ORDER BY updated_at DESC 
                    LIMIT ?
                    """,
                    (client_id, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT * FROM workspace_cases 
                    ORDER BY updated_at DESC 
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
            
            return [self._row_to_case(row) for row in rows]
        finally:
            conn.close()
    
    def _row_to_case(self, row: sqlite3.Row) -> WorkspaceCase:
        """Convert a database row to a WorkspaceCase."""
        return WorkspaceCase(
            case_id=row["case_id"],
            client_id=row["client_id"],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
            context=WorkspaceContext(**json.loads(row["context_json"])),
            outputs=WorkspaceOutputs(**json.loads(row["outputs_json"])),
            last_action=row["last_action"],
        )


# Singleton instance
_store: Optional[WorkspaceStore] = None


def get_store() -> WorkspaceStore:
    """Get the singleton WorkspaceStore instance."""
    global _store
    if _store is None:
        _store = WorkspaceStore()
    return _store
