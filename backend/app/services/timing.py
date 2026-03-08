"""Lightweight timing utilities for request-scoped instrumentation."""
from __future__ import annotations

import time
from typing import Any, Dict, Optional


def now_ms() -> float:
    return time.monotonic() * 1000.0


class TimingContext:
    def __init__(self) -> None:
        self._marks: Dict[str, float] = {}
        self._durations: Dict[str, float] = {}

    def mark(self, name: str) -> None:
        self._marks[name] = now_ms()

    def set_duration(self, name: str, ms: float) -> None:
        self._durations[name] = float(ms)

    def duration_ms(self, name: str) -> Optional[float]:
        if name in self._durations:
            return self._durations[name]
        start_key = f"{name}_start"
        end_key = f"{name}_end"
        if start_key in self._marks and end_key in self._marks:
            return max(0.0, self._marks[end_key] - self._marks[start_key])
        if name in self._marks:
            return max(0.0, now_ms() - self._marks[name])
        return None

    def as_dict(self) -> Dict[str, Any]:
        out: Dict[str, Any] = dict(self._durations)
        for key in list(self._marks.keys()):
            if key.endswith("_start"):
                base = key[:-6]
                end_key = f"{base}_end"
                if end_key in self._marks:
                    out[base] = max(0.0, self._marks[end_key] - self._marks[key])
        return out
