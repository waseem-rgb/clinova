from __future__ import annotations
import os
import time
from typing import Optional, Any
from openai import AsyncOpenAI

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_CHAT_MODEL = os.environ.get("OPENAI_CHAT_MODEL", "gpt-4.1-mini")

client = AsyncOpenAI(api_key=OPENAI_API_KEY)


def _record_timing(timings: Any, key: str, ms: float) -> None:
    if timings is None:
        return
    if hasattr(timings, "set_duration"):
        timings.set_duration(key, ms)
        return
    if isinstance(timings, dict):
        timings[key] = ms


async def llm_generate(prompt: str, *, timings: Optional[Any] = None, timing_key: str = "llm_ms") -> str:
    start = time.monotonic()
    resp = await client.chat.completions.create(
        model=OPENAI_CHAT_MODEL,
        messages=[
            {"role": "system", "content": "You are a careful medical textbook writer. Never invent facts."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
    )
    _record_timing(timings, timing_key, (time.monotonic() - start) * 1000)
    return resp.choices[0].message.content or ""
