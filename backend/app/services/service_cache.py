# backend/app/services/service_cache.py
"""
Shared caching infrastructure for all services.
Provides LRU caching with TTL for expensive API calls (LLM + RAG).
"""
from __future__ import annotations

import hashlib
import json
import time
from collections import OrderedDict
from typing import Any, Dict, Optional


class LRUCacheTTL:
    """Thread-safe LRU cache with TTL expiration."""
    
    def __init__(self, max_size: int = 256, ttl_seconds: int = 3600) -> None:
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds
        self._store: OrderedDict[str, Any] = OrderedDict()
        self._expires: OrderedDict[str, float] = OrderedDict()
        self._hits = 0
        self._misses = 0

    def get(self, key: str) -> Optional[Any]:
        now = time.monotonic()
        exp = self._expires.get(key)
        if exp is None or exp < now:
            self._store.pop(key, None)
            self._expires.pop(key, None)
            self._misses += 1
            return None
        if key in self._store:
            self._store.move_to_end(key)
            self._expires.move_to_end(key)
            self._hits += 1
        return self._store.get(key)

    def set(self, key: str, value: Any) -> None:
        now = time.monotonic()
        self._store[key] = value
        self._expires[key] = now + self.ttl_seconds
        self._store.move_to_end(key)
        self._expires.move_to_end(key)
        while len(self._store) > self.max_size:
            oldest, _ = self._store.popitem(last=False)
            self._expires.pop(oldest, None)

    def stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        return {
            "size": len(self._store),
            "max_size": self.max_size,
            "ttl_seconds": self.ttl_seconds,
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": self._hits / max(self._hits + self._misses, 1),
        }


def cache_key(prefix: str, *args, **kwargs) -> str:
    """Generate a cache key from prefix and arguments."""
    payload = json.dumps({"args": args, "kwargs": kwargs}, sort_keys=True, default=str)
    hash_val = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
    return f"{prefix}:{hash_val}"


# =============================================================================
# GLOBAL CACHES (6-hour TTL for expensive LLM calls, max 500 entries)
# =============================================================================

# Drug details cache - keyed by (drug_name, context_hash)
DRUG_DETAILS_CACHE = LRUCacheTTL(max_size=500, ttl_seconds=6 * 3600)

# Drug interactions cache - keyed by (drugs_tuple, context_hash)
INTERACTIONS_CACHE = LRUCacheTTL(max_size=500, ttl_seconds=6 * 3600)

# Field suggestions cache - keyed by (field, query)
# Short TTL since suggestions can change with context
SUGGESTIONS_CACHE = LRUCacheTTL(max_size=1000, ttl_seconds=300)  # 5 minutes


def get_drug_details_cached(
    drug_name: str,
    age: Optional[int] = None,
    pregnancy: Optional[str] = None,
    renal_status: Optional[str] = None,
    hepatic_status: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Get cached drug details if available."""
    key = cache_key("drug", drug_name.lower(), age=age, pregnancy=pregnancy,
                    renal_status=renal_status, hepatic_status=hepatic_status)
    return DRUG_DETAILS_CACHE.get(key)


def set_drug_details_cached(
    drug_name: str,
    result: Dict[str, Any],
    age: Optional[int] = None,
    pregnancy: Optional[str] = None,
    renal_status: Optional[str] = None,
    hepatic_status: Optional[str] = None,
) -> None:
    """Cache drug details result."""
    key = cache_key("drug", drug_name.lower(), age=age, pregnancy=pregnancy,
                    renal_status=renal_status, hepatic_status=hepatic_status)
    DRUG_DETAILS_CACHE.set(key, result)


def get_interactions_cached(
    drugs: list,
    context: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Get cached interactions if available."""
    drugs_sorted = tuple(sorted([d.lower().strip() for d in drugs]))
    key = cache_key("interactions", drugs_sorted, context=context or {})
    return INTERACTIONS_CACHE.get(key)


def set_interactions_cached(
    drugs: list,
    result: Dict[str, Any],
    context: Optional[Dict[str, Any]] = None,
) -> None:
    """Cache interactions result."""
    drugs_sorted = tuple(sorted([d.lower().strip() for d in drugs]))
    key = cache_key("interactions", drugs_sorted, context=context or {})
    INTERACTIONS_CACHE.set(key, result)


def get_cache_stats() -> Dict[str, Any]:
    """Get all cache statistics."""
    return {
        "drug_details": DRUG_DETAILS_CACHE.stats(),
        "interactions": INTERACTIONS_CACHE.stats(),
        "suggestions": SUGGESTIONS_CACHE.stats(),
    }
