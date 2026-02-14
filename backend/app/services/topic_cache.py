# Doctor-grade fixes: narrative filter + urine qual severity + B12 normalization + HDL low + DM severity
from __future__ import annotations

import time
from collections import OrderedDict
from typing import Any, Optional


class LRUCacheTTL:
    def __init__(self, max_size: int = 256, ttl_seconds: int = 3600) -> None:
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds
        self._store: OrderedDict[str, Any] = OrderedDict()
        self._expires: OrderedDict[str, float] = OrderedDict()

    def get(self, key: str) -> Optional[Any]:
        now = time.monotonic()
        exp = self._expires.get(key)
        if exp is None or exp < now:
            self._store.pop(key, None)
            self._expires.pop(key, None)
            return None
        if key in self._store:
            self._store.move_to_end(key)
            self._expires.move_to_end(key)
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
