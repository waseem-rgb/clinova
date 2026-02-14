from __future__ import annotations

from typing import Any, Dict, List, Tuple, Optional
import asyncio
import re

from app.rag.templates import TEMPLATES
from app.rag.routing import Route
from app.api.schemas import EvidenceItem, SectionOut


# -------------------------------------------------------------------
# Safety: strip any accidental citation leakage from LLM output
# -------------------------------------------------------------------
_CITATION_PATTERNS = [
    r"\bSources?\s*:\s*.*?$",
    r"\[\d+\]",
    r"\(p\.?\s*\d+\)",
    r"\bpage\s+\d+\b",
]

def _strip_citations(text: str) -> str:
    out = text or ""
    for pat in _CITATION_PATTERNS:
        out = re.sub(pat, "", out, flags=re.IGNORECASE | re.MULTILINE)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


def _clamp(n: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, int(n)))


# -------------------------------------------------------------------
# Section-specific retrieval intent builder
# -------------------------------------------------------------------
def _section_queries(topic: str, section: str) -> List[str]:
    t = topic.strip()
    s = section.lower()

    if "definition" in s:
        return [f"{t} definition", t]
    if "classification" in s:
        return [f"{t} classification", f"{t} types"]
    if "etiology" in s or "risk" in s:
        return [f"{t} etiology", f"{t} risk factors"]
    if "pathophysiology" in s:
        return [f"{t} pathophysiology", f"{t} mechanism"]
    if "clinical" in s:
        return [f"{t} clinical features", f"{t} presentation"]
    if "differential" in s:
        return [f"{t} differential diagnosis", f"{t} ddx"]
    if "diagnos" in s:
        return [f"{t} diagnosis", f"{t} evaluation"]
    if "investig" in s:
        return [f"{t} investigations", f"{t} lab findings", f"{t} imaging"]
    if "management" in s or "treatment" in s:
        return [f"{t} management", f"{t} treatment"]
    if "complication" in s:
        return [f"{t} complications"]
    if "special" in s or "pregnancy" in s:
        return [f"{t} special populations", f"{t} pregnancy"]
    if "prognosis" in s:
        return [f"{t} prognosis"]
    if "follow" in s:
        return [f"{t} follow up", f"{t} monitoring"]

    return [f"{t} {section}"]


# -------------------------------------------------------------------
# Convert retrieved chunks → EvidenceItem list
# (kept separate so UI can collapse evidence)
# -------------------------------------------------------------------
def _build_evidence(route: Route, docs: List[Dict[str, Any]], limit: int) -> List[EvidenceItem]:
    evidence: List[EvidenceItem] = []
    for d in docs[:limit]:
        meta = d.get("metadata", {}) or {}
        evidence.append(
            EvidenceItem(
                book=str(meta.get("book", meta.get("source", "Unknown"))),
                collection=route.collection,
                page=meta.get("page"),
                chapter=meta.get("chapter"),
                section=meta.get("section") or meta.get("heading"),
                snippet=(d.get("text") or "").strip()[:1200],
                chunk_id=d.get("id"),
                score=d.get("score"),
                meta=meta,
            )
        )
    return evidence


def _compress_context(docs: List[Dict[str, Any]], max_chars: int) -> str:
    """
    Keeps context bounded so the LLM is fast and less likely to time out.
    We keep only the first N chars per chunk and stop at max_chars total.
    """
    parts: List[str] = []
    total = 0

    for i, d in enumerate(docs, 1):
        txt = (d.get("text") or "").strip()
        if not txt:
            continue

        # Per-chunk cap to avoid one chunk consuming everything
        txt = txt[:1200]

        block = f"[TEXT {i}]\n{txt}\n"
        if total + len(block) > max_chars:
            break
        parts.append(block)
        total += len(block)

    return "\n".join(parts).strip()


async def _call_llm_with_timeout(llm_fn, prompt: str, timeout_s: int) -> str:
    """
    Protects API responsiveness. If timeout occurs, returns a safe fallback.
    """
    try:
        return await asyncio.wait_for(llm_fn(prompt), timeout=timeout_s)
    except asyncio.TimeoutError:
        return "_Section generation timed out. Switch to mode=fast or reduce max_sections/k to get a quick answer._"
    except Exception as e:
        return f"_Section generation failed: {e}_"


# -------------------------------------------------------------------
# MAIN MONOGRAPH BUILDER
# -------------------------------------------------------------------
async def generate_monograph(
    *,
    route: Route,
    query: str,
    retrieve_fn,
    llm_fn,
    mode: str = "fast",                 # "fast" (default) or "full"
    max_sections: Optional[int] = None, # default depends on mode
    k_per_section: int = 8,             # fewer docs = faster
    max_evidence_per_section: int = 6,
    timeout_s: int = 35,                # per-section LLM timeout
) -> Tuple[List[SectionOut], List[EvidenceItem], str]:

    mode = (mode or "fast").strip().lower()
    if mode not in ("fast", "full"):
        mode = "fast"

    # FAST mode: fewer sections + smaller context = quick responses
    if max_sections is None:
        max_sections = 8 if mode == "fast" else 999

    max_sections = _clamp(max_sections, 2, 50)
    k_per_section = _clamp(k_per_section, 3, 20)
    max_evidence_per_section = _clamp(max_evidence_per_section, 2, 20)
    timeout_s = _clamp(timeout_s, 10, 120)

    template = list(TEMPLATES[route.template])
    template = template[:max_sections]

    # Context budget (chars) per section; keep bounded to prevent "hang"
    context_budget = 4500 if mode == "fast" else 9000

    sections: List[SectionOut] = []
    all_evidence: List[EvidenceItem] = []

    for section_title in template:
        # ---- retrieval
        retrieved: List[Dict[str, Any]] = []
        seen_ids = set()

        for q in _section_queries(query, section_title):
            docs = retrieve_fn(route.collection, q, k_per_section)
            for d in docs:
                cid = d.get("id")
                if cid and cid in seen_ids:
                    continue
                seen_ids.add(cid)
                retrieved.append(d)

        evidence = _build_evidence(route, retrieved, max_evidence_per_section)
        all_evidence.extend(evidence)

        # ---- bounded context (prevents huge dumps and speeds LLM)
        context = _compress_context(retrieved[:k_per_section], max_chars=context_budget)

        if not context:
            content = "_This section is not described in the available textbook excerpts._"
        else:
            # FAST mode prompt: still doctor-grade, but concise + complete
            if mode == "fast":
                style = (
                    "Write clinically useful content in 6–14 bullet points and/or a short table if appropriate. "
                    "Be specific. Do not omit key items if present in context."
                )
            else:
                style = (
                    "Write exhaustive textbook-style paragraphs. Include subheadings and tables if useful. "
                    "Be as comprehensive as the context allows."
                )

            prompt = f"""
You are writing for qualified doctors.

STRICT RULES (NON-NEGOTIABLE):
- Use ONLY the provided CONTEXT.
- DO NOT add external medical knowledge.
- DO NOT show citations, page numbers, or sources.
- If information is not present, explicitly state it is not described.

STYLE:
{style}

TASK:
Write the section "{section_title}" for the topic "{query}".

CONTEXT:
{context}
""".strip()

            content = await _call_llm_with_timeout(llm_fn, prompt, timeout_s=timeout_s)

        content = _strip_citations(content)

        sections.append(
            SectionOut(
                title=section_title,
                content_md=content,
                evidence=evidence,
            )
        )

    # ---- Build doctor_view_md (clean, citation-free)
    md_parts = [f"# {query}\n"]
    for s in sections:
        md_parts.append(f"## {s.title}\n{s.content_md}\n")
    doctor_view_md = "\n".join(md_parts).strip()

    # ---- de-duplicate evidence
    unique: List[EvidenceItem] = []
    seen = set()
    for e in all_evidence:
        key = (e.chunk_id or "", e.snippet[:100])
        if key in seen:
            continue
        seen.add(key)
        unique.append(e)

    return sections, unique, doctor_view_md
