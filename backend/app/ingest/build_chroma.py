from __future__ import annotations

import hashlib
import json
import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import chromadb
from chromadb.utils import embedding_functions


# -----------------------------
# CONFIG (edit here if needed)
# -----------------------------

# Where Chroma DB will be stored (you already created this folder)
CHROMA_BASE_DIR = Path(os.getenv("CHROMA_BASE_DIR", "app/data/chroma"))

# OpenAI embedding model
# Recommended: text-embedding-3-large or text-embedding-3-small
OPENAI_EMBED_MODEL = os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-large")

# Chunk limits to avoid token/request limits
BATCH_SIZE = int(os.getenv("CHROMA_BATCH_SIZE", "64"))
MAX_CHARS_PER_DOC = int(os.getenv("CHROMA_MAX_CHARS_PER_DOC", "12000"))

# Reset everything (delete chroma folder) if RESET_CHROMA=1
RESET_CHROMA = os.getenv("RESET_CHROMA", "0") == "1"


# Which raw chunk files map to which strict feature collection
# (You can change paths if your files are named differently)
COLLECTION_SPECS = [
    {
        "name": "medicine_harrison",
        "chunk_files": ["app/data/raw_chunks/harrison_22_chunks.json"],
    },
    {
        "name": "obgyn_dutta",
        "chunk_files": ["app/data/raw_chunks/dutta_obgyn_chunks.json"],
    },
    {
        "name": "surgery_oxford",
        "chunk_files": ["app/data/raw_chunks/oxford_surgery_chunks.json"],
    },
    {
        "name": "pediatrics_oxford",
        "chunk_files": ["app/data/raw_chunks/oxford_pediatrics_chunks.json"],
    },
    {
        "name": "drugs_mims_kd",
        "chunk_files": [
            "app/data/raw_chunks/mims_2023_24_chunks.json",
            "app/data/raw_chunks/kd_tripathi_chunks.json",
        ],
    },
]


# -----------------------------
# HELPERS
# -----------------------------

def _require_openai_key() -> str:
    """
    We DO NOT hardcode the key.
    We read it from environment:
      - OPENAI_API_KEY
    """
    key = os.getenv("OPENAI_API_KEY")
    if not key or not key.strip():
        raise RuntimeError(
            "OPENAI_API_KEY is missing.\n"
            "Set it before running:\n"
            "  export OPENAI_API_KEY='sk-...'\n"
            "Or put it into a .env and load it in your shell.\n"
        )
    return key.strip()


def _norm_text_for_id(text: str) -> str:
    t = (text or "").strip().lower()
    # Keep hashing input bounded (prevents huge memory usage)
    if len(t) > 2000:
        t = t[:2000]
    return t


def _stable_id(book_id: str, page: Any, section: Any, text: str) -> str:
    """
    Content-hash based ID to avoid collisions when chunk_index is missing/duplicated.
    """
    t = _norm_text_for_id(text)
    s = f"{book_id}|{page}|{section}|{t}"
    return hashlib.sha1(s.encode("utf-8")).hexdigest()


def _safe_text(text: str) -> str:
    t = (text or "").strip()
    if not t:
        return ""
    if len(t) > MAX_CHARS_PER_DOC:
        t = t[:MAX_CHARS_PER_DOC]
    return t


def _load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _extract_fields(c: Dict[str, Any]) -> Tuple[str, Optional[int], str, str, Dict[str, Any]]:
    """
    Normalizes chunk schema across books.
    Expected chunk keys you have:
      - book_id
      - book_title
      - page_number
      - meta.section
      - text
    """
    book_id = str(c.get("book_id") or "").strip() or "unknown_book"
    page_number = c.get("page_number")
    if not isinstance(page_number, int):
        page_number = None

    meta = c.get("meta") or {}
    section = str(meta.get("section") or "").strip() or "NO_SECTION"

    text = _safe_text(c.get("text") or "")

    # Store metadata for filtering + citations later
    md = {
        "book_id": book_id,
        "book_title": str(c.get("book_title") or "").strip(),
        "page_number": page_number if page_number is not None else -1,
        "section": section,
    }
    return book_id, page_number, section, text, md


@dataclass
class DocRow:
    id: str
    text: str
    meta: Dict[str, Any]


def _load_chunks_from_files(files: List[str]) -> List[DocRow]:
    rows: List[DocRow] = []
    for fp in files:
        p = Path(fp)
        if not p.exists():
            raise FileNotFoundError(f"Missing chunk file: {fp}")

        data = _load_json(p)
        if not isinstance(data, list):
            raise ValueError(f"Chunk file must be a JSON list: {fp}")

        for c in data:
            if not isinstance(c, dict):
                continue
            book_id, page, section, text, md = _extract_fields(c)
            if not text:
                # skip empty docs (reduces junk embeddings)
                continue
            doc_id = _stable_id(book_id, page, section, text)
            rows.append(DocRow(id=doc_id, text=text, meta=md))

    return rows


def _batched(iterable: List[DocRow], size: int) -> Iterable[List[DocRow]]:
    for i in range(0, len(iterable), size):
        yield iterable[i : i + size]


def _reset_chroma_dir():
    if CHROMA_BASE_DIR.exists():
        shutil.rmtree(CHROMA_BASE_DIR)
    CHROMA_BASE_DIR.mkdir(parents=True, exist_ok=True)


# -----------------------------
# MAIN BUILD
# -----------------------------

def main():
    _require_openai_key()

    if RESET_CHROMA:
        _reset_chroma_dir()
    else:
        CHROMA_BASE_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Chroma path: {CHROMA_BASE_DIR.resolve()}")
    print(f"Embed model: {OPENAI_EMBED_MODEL}")
    print(f"Batch size: {BATCH_SIZE}")
    print(f"Max chars/doc: {MAX_CHARS_PER_DOC}")
    print()

    emb = embedding_functions.OpenAIEmbeddingFunction(
        api_key=os.getenv("OPENAI_API_KEY"),
        model_name=OPENAI_EMBED_MODEL,
    )

    client = chromadb.PersistentClient(path=str(CHROMA_BASE_DIR))

    for spec in COLLECTION_SPECS:
        name = spec["name"]
        files = spec["chunk_files"]

        print(f"♦ Building collection: {name}")
        print(f"  - Loading: {', '.join(files)}")

        docs = _load_chunks_from_files(files)
        print(f"  - Prepared docs (non-empty): {len(docs)}")

        # Drop and recreate collection if reset mode
        if RESET_CHROMA:
            try:
                client.delete_collection(name)
                print("  - Deleted existing collection")
            except Exception:
                pass

        col = client.get_or_create_collection(name=name, embedding_function=emb)

        # IMPORTANT: avoid Chroma DuplicateIDError even inside the same run
        # by removing duplicates in-memory before insert
        unique: Dict[str, DocRow] = {}
        for d in docs:
            if d.id not in unique:
                unique[d.id] = d
        docs = list(unique.values())
        print(f"  - Unique docs (by ID): {len(docs)}")

        # Insert in batches
        inserted = 0
        for batch in _batched(docs, BATCH_SIZE):
            ids = [d.id for d in batch]
            texts = [d.text for d in batch]
            metas = [d.meta for d in batch]
            col.add(ids=ids, documents=texts, metadatas=metas)
            inserted += len(batch)

            if inserted % (BATCH_SIZE * 10) == 0:
                print(f"    inserted: {inserted}/{len(docs)}")

        print(f"  ✅ Done: {name} count={col.count()}")
        print()

    print("✅ All collections built successfully.")


if __name__ == "__main__":
    main()
