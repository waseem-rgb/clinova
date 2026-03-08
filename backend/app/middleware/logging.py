"""Request logging middleware with request_id propagation."""
from __future__ import annotations

import logging
import uuid

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from app.services.timing import TimingContext

logger = logging.getLogger("clinova.request")

REQUEST_ID_HEADER = "x-request-id"
TOTAL_TIME_HEADER = "x-time-total-ms"


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get(REQUEST_ID_HEADER)
        if not request_id:
            request_id = str(uuid.uuid4())

        request.state.request_id = request_id

        timings = TimingContext()
        timings.mark("total_start")
        request.state.timings = timings

        response = await call_next(request)

        timings.mark("total_end")
        total_ms = timings.duration_ms("total")

        response.headers[REQUEST_ID_HEADER] = request_id
        if total_ms is not None:
            response.headers[TOTAL_TIME_HEADER] = str(int(total_ms))

        logger.info(
            "request | method=%s | path=%s | status=%s | duration_ms=%s | request_id=%s",
            request.method,
            request.url.path,
            response.status_code,
            int(total_ms) if total_ms is not None else "-",
            request_id,
        )

        return response
