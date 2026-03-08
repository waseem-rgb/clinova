from __future__ import annotations

from typing import Dict, List, Any, Tuple, Optional
import os
import time

import chromadb
from chromadb.utils import embedding_functions
from openai import OpenAI


# -----------------------------
# CONFIG (via env)
# -----------------------------

CHROMA_DIR = os.getenv("CHROMA_BASE_DIR", "app/data/chroma")

EMBED_MODEL = os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-large")
LLM_MODEL = os.getenv("OPENAI_CHAT_MODEL", "gpt-4.1")

# Retrieval: increase for "everything"
TOP_K_PER_QUERY = int(os.getenv("RAG_TOPK_PER_QUERY", "80"))  # was 25
MAX_UNIQUE_SOURCES = int(os.getenv("RAG_MAX_UNIQUE_SOURCES", "220"))  # cap for cost/speed

# Chunk extraction batching
BATCH_SIZE_SOURCES = int(os.getenv("RAG_SOURCE_BATCH_SIZE", "18"))  # sources per LLM call
SLEEP_BETWEEN_CALLS_SEC = float(os.getenv("RAG_SLEEP_BETWEEN_CALLS_SEC", "0"))

# Output format headings (doctor-grade)
HEADINGS = [
    "Definition",
    "Classification",
    "Epidemiology",
    "Etiology / Causes",
    "Pathophysiology",
    "Clinical Features",
    "Diagnosis",
    "Differential Diagnosis",
    "Investigations",
    "Management",
    "Acute Management",
    "Long-term Management",
    "Special Populations",
    "Complications",
    "Prognosis",
    "Red Flags / Must Not Miss",
    "Key Tables / Figures (describe)",
]


# -----------------------------
# CLIENTS
# -----------------------------

def _require_env(key: str) -> str:
    v = os.getenv(key)
    if not v:
        raise RuntimeError(
            f"Missing environment variable: {key}\n"
            f"Set it in your shell or .env file before running."
        )
    return v


# Lazy singletons to avoid recreating clients on every call
_CHROMA_CLIENT: Optional[chromadb.PersistentClient] = None
_EMBED_FN: Optional[embedding_functions.OpenAIEmbeddingFunction] = None
_LLM: Optional[OpenAI] = None


def get_chroma_client() -> chromadb.PersistentClient:
    global _CHROMA_CLIENT
    if _CHROMA_CLIENT is None:
        _CHROMA_CLIENT = chromadb.PersistentClient(path=CHROMA_DIR)
    return _CHROMA_CLIENT


def get_embedding_fn() -> embedding_functions.OpenAIEmbeddingFunction:
    global _EMBED_FN
    if _EMBED_FN is None:
        _EMBED_FN = embedding_functions.OpenAIEmbeddingFunction(
            api_key=_require_env("OPENAI_API_KEY"),
            model_name=EMBED_MODEL,
        )
    return _EMBED_FN


def get_llm() -> OpenAI:
    global _LLM
    if _LLM is None:
        _LLM = OpenAI(api_key=_require_env("OPENAI_API_KEY"))
    return _LLM


# -----------------------------
# HELPERS
# -----------------------------

def _normalize_meta(m: Dict[str, Any]) -> Dict[str, Any]:
    # Ensure consistent keys even if some are missing
    return {
        "book_title": m.get("book_title"),
        "book_id": m.get("book_id"),
        "page_number": m.get("page_number"),
        "section": m.get("section"),
    }


def _make_source_id(meta: Dict[str, Any], text: str) -> str:
    """
    Create a deterministic ID to dedupe sources (page+section+hash snippet).
    """
    page = meta.get("page_number")
    sec = meta.get("section") or ""
    h = abs(hash((str(page), sec, text[:200]))) % (10**12)
    return f"p{page}_h{h}"


def _multi_queries(topic: str) -> List[str]:
    """
    Multi-query = higher recall = closer to "everything in textbook".
    """
    t = topic.strip()
    return [
        t,
        f"{t} definition",
        f"{t} epidemiology",
        f"{t} causes etiology",
        f"{t} classification types",
        f"{t} clinical features presentation",
        f"{t} diagnosis evaluation workup",
        f"{t} differential diagnosis",
        f"{t} investigations EEG MRI",
        f"{t} management treatment",
        f"{t} complications prognosis",
        f"{t} pregnancy women special populations",
        f"{t} pediatric considerations",
    ]


def _group_batches(items: List[Any], batch_size: int) -> List[List[Any]]:
    return [items[i:i + batch_size] for i in range(0, len(items), batch_size)]


# -----------------------------
# MAP STEP: extract points from sources
# -----------------------------

def _extract_points_from_sources(
    *,
    llm: OpenAI,
    topic: str,
    sources: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Given a batch of sources (each with source_num, meta, text),
    extract ALL topic-relevant points, without summarizing away detail.
    """

    src_blocks = []
    for s in sources:
        src_blocks.append(
            f"[SOURCE {s['source_num']} | Page {s['meta'].get('page_number')} | {s['meta'].get('section')}]\n"
            f"{s['text']}"
        )
    context = "\n\n".join(src_blocks)

    system = (
        "You are a medical textbook extraction engine.\n"
        "CRITICAL RULES:\n"
        "- Use ONLY the provided excerpts.\n"
        "- DO NOT add outside knowledge.\n"
        "- DO NOT compress aggressively; keep details, criteria, numbers, drug names, steps.\n"
        "- Extract everything relevant to the topic, even if repeated; we will dedupe later.\n"
        "- Every bullet MUST include one or more citations like (Sources: 3) or (Sources: 2,5).\n"
        "- If a line is only partially relevant, keep the relevant part.\n\n"
        "Return STRICT JSON with keys exactly:\n"
        "{\n"
        '  "notes": {\n'
        '     "<Heading>": ["bullet...", "..."],\n'
        '     ...\n'
        "  }\n"
        "}\n"
        f"Allowed headings are exactly: {HEADINGS}\n"
    )

    user = (
        f"TOPIC: {topic}\n\n"
        "Extract all topic-relevant points from these excerpts and place them under the most suitable headings.\n\n"
        f"EXCERPTS:\n{context}"
    )

    resp = llm.chat.completions.create(
        model=LLM_MODEL,
        temperature=0.0,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )

    content = resp.choices[0].message.content or ""
    import json
    try:
        return json.loads(content)
    except Exception:
        return {"notes": {"Diagnosis": [f"(Parsing fallback) Raw extract:\n{content}"]}}


def _merge_notes(all_notes: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    merged: Dict[str, List[str]] = {h: [] for h in HEADINGS}
    for pack in all_notes:
        notes = (pack or {}).get("notes") or {}
        for h, bullets in notes.items():
            if h not in merged:
                continue
            if isinstance(bullets, list):
                merged[h].extend([b for b in bullets if isinstance(b, str) and b.strip()])
    return merged


def _dedupe_bullets(bullets: List[str]) -> List[str]:
    seen = set()
    out = []
    for b in bullets:
        key = " ".join(b.lower().split())
        key2 = key.replace("(sources:", "").replace(")", "")
        if key2 in seen:
            continue
        seen.add(key2)
        out.append(b)
    return out


def _final_format_markdown(topic: str, merged: Dict[str, List[str]]) -> str:
    lines = [f"# {topic} (Textbook-only)\n"]
    for h in HEADINGS:
        bullets = _dedupe_bullets(merged.get(h, []) or [])
        if not bullets:
            continue
        lines.append(f"## {h}\n")
        for b in bullets:
            if b.lstrip().startswith(("-", "*")):
                lines.append(b)
            else:
                lines.append(f"- {b}")
        lines.append("")
    return "\n".join(lines).strip() + "\n"


# -----------------------------
# CORE RAG FUNCTION (EXHAUSTIVE)
# -----------------------------

def query_topic(*, collection_name: str, topic: str, timings: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    STRICT + EXHAUSTIVE RAG:
    - Queries ONE collection only
    - Uses multi-query high recall retrieval
    - Extracts chunk-by-chunk (map)
    - Merges into comprehensive doctor output (merge)
    """
    total_start = time.monotonic()

    client = get_chroma_client()
    embed_fn = get_embedding_fn()
    llm = get_llm()

    collection = client.get_collection(name=collection_name, embedding_function=embed_fn)

    queries = _multi_queries(topic)

    gathered: List[Tuple[str, Dict[str, Any], str]] = []  # (dedupe_id, meta, doc)
    seen_ids = set()

    retrieval_start = time.monotonic()
    for q in queries:
        r = collection.query(
            query_texts=[q],
            n_results=TOP_K_PER_QUERY,
            include=["documents", "metadatas"],
        )
        docs = r["documents"][0]
        metas = r["metadatas"][0]

        for doc, meta in zip(docs, metas):
            meta = _normalize_meta(meta or {})
            doc = doc or ""
            did = _make_source_id(meta, doc)
            if did in seen_ids:
                continue
            seen_ids.add(did)
            gathered.append((did, meta, doc))
            if len(gathered) >= MAX_UNIQUE_SOURCES:
                break
        if len(gathered) >= MAX_UNIQUE_SOURCES:
            break
    retrieval_ms = (time.monotonic() - retrieval_start) * 1000

    if not gathered:
        result = {
            "topic": topic,
            "source_collection": collection_name,
            "content": "No content found in textbook.",
            "citations": [],
            "debug": {"retrieved_sources": 0},
        }
        if timings is not None:
            timings["retrieval_ms"] = retrieval_ms
            timings["llm_ms"] = 0.0
            timings["total_ms"] = (time.monotonic() - total_start) * 1000
            result["timings"] = dict(timings)
        return result

    sources_for_llm: List[Dict[str, Any]] = []
    citations: List[Dict[str, Any]] = []
    for idx, (_did, meta, doc) in enumerate(gathered, start=1):
        sources_for_llm.append({"source_num": idx, "meta": meta, "text": doc})
        citations.append(
            {
                "source_id": idx,
                "book": meta.get("book_title"),
                "page": meta.get("page_number"),
                "section": meta.get("section"),
            }
        )

    batches = _group_batches(sources_for_llm, BATCH_SIZE_SOURCES)
    extracted_packs: List[Dict[str, Any]] = []

    llm_ms_total = 0.0
    for batch in batches:
        llm_start = time.monotonic()
        pack = _extract_points_from_sources(llm=llm, topic=topic, sources=batch)
        llm_ms_total += (time.monotonic() - llm_start) * 1000
        extracted_packs.append(pack)
        if SLEEP_BETWEEN_CALLS_SEC > 0:
            time.sleep(SLEEP_BETWEEN_CALLS_SEC)

    merged = _merge_notes(extracted_packs)
    content_md = _final_format_markdown(topic, merged)

    result = {
        "topic": topic,
        "source_collection": collection_name,
        "content": content_md,
        "citations": citations,
        "debug": {
            "queries_used": queries,
            "retrieved_sources": len(sources_for_llm),
            "batches": len(batches),
            "top_k_per_query": TOP_K_PER_QUERY,
            "max_unique_sources": MAX_UNIQUE_SOURCES,
        },
    }

    if timings is not None:
        timings["retrieval_ms"] = retrieval_ms
        timings["llm_ms"] = llm_ms_total
        timings["total_ms"] = (time.monotonic() - total_start) * 1000
        result["timings"] = dict(timings)

    return result


# -----------------------------
# FEATURE-SPECIFIC WRAPPERS
# -----------------------------

def medicine_topic(topic: str) -> Dict[str, Any]:
    return query_topic(collection_name="medicine_harrison", topic=topic)


def obgyn_topic(topic: str) -> Dict[str, Any]:
    return query_topic(collection_name="obgyn_dutta", topic=topic)


def surgery_topic(topic: str) -> Dict[str, Any]:
    return query_topic(collection_name="surgery_oxford", topic=topic)


def pediatrics_topic(topic: str) -> Dict[str, Any]:
    return query_topic(collection_name="pediatrics_oxford", topic=topic)


def drug_topic(drug_name: str) -> Dict[str, Any]:
    return query_topic(collection_name="drugs_mims_kd", topic=drug_name)


# -----------------------------
# Retrieval adapter for monograph builder
# (Chroma: do NOT include "ids" in include list)
# -----------------------------

def retrieve(collection_name: str, query: str, k: int = 12) -> List[Dict[str, Any]]:
    """
    Returns list of dict:
      { "id": str, "text": str, "score": float|None, "metadata": dict }
    """
    client = get_chroma_client()
    embed_fn = get_embedding_fn()
    collection = client.get_collection(name=collection_name, embedding_function=embed_fn)

    res = collection.query(
        query_texts=[query],
        n_results=int(k),
        include=["documents", "metadatas", "distances"],  # ✅ "ids" is NOT allowed in include
    )

    ids = (res.get("ids") or [[]])[0]  # ids are returned automatically
    docs = (res.get("documents") or [[]])[0]
    metas = (res.get("metadatas") or [[]])[0]
    dists = (res.get("distances") or [[]])[0]

    out: List[Dict[str, Any]] = []
    n = len(ids)
    for i in range(n):
        out.append(
            {
                "id": ids[i],
                "text": docs[i] if i < len(docs) else "",
                "metadata": metas[i] if i < len(metas) and metas[i] is not None else {},
                "score": float(dists[i]) if i < len(dists) and dists[i] is not None else None,
            }
        )
    return out
