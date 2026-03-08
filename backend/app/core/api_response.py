"""Shared API response envelope helpers."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import Request


def _build_meta(request: Optional[Request], duration_ms: Optional[int]) -> Optional[Dict[str, Any]]:
    if request is None:
        return None
    request_id = getattr(request.state, "request_id", None)
    return {
        "request_id": request_id,
        "path": request.url.path,
        "method": request.method,
        "duration_ms": duration_ms,
    }


def ok(data: Any = None, *, request: Optional[Request] = None, duration_ms: Optional[int] = None) -> Dict[str, Any]:
    return {
        "success": True,
        "data": data,
        "error": None,
        "meta": _build_meta(request, duration_ms),
    }


def fail(
    code: str,
    message: str,
    *,
    details: Optional[Dict[str, Any]] = None,
    request: Optional[Request] = None,
    duration_ms: Optional[int] = None,
) -> Dict[str, Any]:
    return {
        "success": False,
        "data": None,
        "error": {"code": code, "message": message, "details": details},
        "meta": _build_meta(request, duration_ms),
    }
