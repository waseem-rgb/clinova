# backend/app/api/auth.py
"""
API Key authentication for external integrations.

Reads allowed API keys from CLINOVA_API_KEYS environment variable (comma-separated).
Validates the X-Clinova-Key header on requests.
Logs minimal request info: endpoint, key prefix, latency_ms, status_code.
"""
from __future__ import annotations

import logging
import os
import time
from functools import lru_cache
from typing import Set

from fastapi import HTTPException, Request, status
from fastapi.security import APIKeyHeader

logger = logging.getLogger("clinova.integrations")

# Header name for API key
API_KEY_HEADER = "X-Clinova-Key"

api_key_header = APIKeyHeader(name=API_KEY_HEADER, auto_error=False)


@lru_cache(maxsize=1)
def get_allowed_api_keys() -> Set[str]:
    """
    Load allowed API keys from environment variable.
    Cached to avoid re-parsing on every request.
    """
    keys_raw = os.getenv("CLINOVA_API_KEYS", "")
    if not keys_raw:
        logger.warning("CLINOVA_API_KEYS not set - no integrations will be authorized")
        return set()

    keys = {k.strip() for k in keys_raw.split(",") if k.strip()}
    logger.info(f"Loaded {len(keys)} API keys for integrations")
    return keys


def _key_prefix(key: str | None) -> str:
    """Return first 8 chars of key for logging, or 'none' if missing."""
    if not key:
        return "none"
    return key[:8] + "..." if len(key) > 8 else key


async def require_api_key(request: Request) -> str:
    """
    FastAPI dependency that validates the X-Clinova-Key header.

    Raises:
        HTTPException 401 if key is missing or invalid.

    Returns:
        The validated API key (for downstream use if needed).
    """
    start_time = time.time()

    # Extract key from header
    api_key = request.headers.get(API_KEY_HEADER)
    key_prefix = _key_prefix(api_key)
    endpoint = f"{request.method} {request.url.path}"

    # Validate
    if not api_key:
        latency_ms = int((time.time() - start_time) * 1000)
        logger.warning(f"integration_auth | endpoint={endpoint} | key={key_prefix} | latency_ms={latency_ms} | status=401 | reason=missing_key")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Clinova-Key header",
        )

    allowed_keys = get_allowed_api_keys()

    if api_key not in allowed_keys:
        latency_ms = int((time.time() - start_time) * 1000)
        logger.warning(f"integration_auth | endpoint={endpoint} | key={key_prefix} | latency_ms={latency_ms} | status=401 | reason=invalid_key")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )

    # Store key and start time in request state for logging in response
    request.state.api_key = api_key
    request.state.api_key_prefix = key_prefix
    request.state.request_start_time = start_time

    return api_key


def log_integration_request(request: Request, status_code: int) -> None:
    """
    Log integration request after completion.
    Call this from endpoint or middleware after response is ready.
    """
    endpoint = f"{request.method} {request.url.path}"
    key_prefix = getattr(request.state, "api_key_prefix", "unknown")
    start_time = getattr(request.state, "request_start_time", time.time())
    latency_ms = int((time.time() - start_time) * 1000)

    logger.info(f"integration_request | endpoint={endpoint} | key={key_prefix} | latency_ms={latency_ms} | status={status_code}")


def clear_api_keys_cache() -> None:
    """Clear the API keys cache (useful for testing or hot-reload)."""
    get_allowed_api_keys.cache_clear()
