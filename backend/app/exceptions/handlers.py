"""Global exception handlers for safe JSON responses."""
from __future__ import annotations

import logging
import time
from typing import Optional

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.api_response import fail

logger = logging.getLogger("clinova.exceptions")


def _duration_ms(request: Request) -> Optional[int]:
    start_time = getattr(request.state, "request_start_time", None)
    if start_time is None:
        return None
    return int((time.time() - start_time) * 1000)


def register_exception_handlers(app) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        status_code = exc.status_code
        detail = exc.detail if isinstance(exc.detail, str) else "Request failed"
        payload = fail(
            code=f"http_{status_code}",
            message=detail,
            details=None,
            request=request,
            duration_ms=_duration_ms(request),
        )
        return JSONResponse(status_code=status_code, content=payload)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        payload = fail(
            code="validation_error",
            message="Validation failed",
            details={"errors": exc.errors()},
            request=request,
            duration_ms=_duration_ms(request),
        )
        return JSONResponse(status_code=422, content=payload)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception(
            "unhandled_exception | method=%s | path=%s | request_id=%s",
            request.method,
            request.url.path,
            getattr(request.state, "request_id", None),
        )
        payload = fail(
            code="internal_error",
            message="Internal server error",
            details=None,
            request=request,
            duration_ms=_duration_ms(request),
        )
        return JSONResponse(status_code=500, content=payload)
