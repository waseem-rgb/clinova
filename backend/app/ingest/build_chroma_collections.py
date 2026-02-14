from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction


# ========= IMPORTANT: single embedding model for ALL collections =========
# Keep this stable forever once you build your DB.
EMBED_MODEL = os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small")


BASE_CHROMA_DIR = Path("app/data/chroma")

RAW_DIR = Path("app/data/raw_chunks")
HARRISON_JSON = RAW_DIR / "harrison_22_chunks.json"
DUTTA_JSON = RAW_DIR / "dutta_obgyn_chunks.json"
SURGERY_JSON = RAW_DIR / "oxford_surgery_chunks.json"
PEDS_JSON = RAW_DIR / "oxford_pediatrics_chunks.json"
MIMS_JSON = RAW_DIR / "mims_2023_24_chunks.json"
KD_JSON = RAW_DIR / "kd_tripathi_chunks.json"


def _norm(s: str) -> str:
    return " ".join((s or "").split()).strip()


def is_junk_text(t: str) -> bool:
    t = (t or "").strip()
    if not t:
        return True
    if len(t) < 80:
        return True
    low = t.lower()
    if "this page intentionally left blank" in low:
        return True
    return False


def load_chunks(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Missing raw chunk file: {path}")
    data = json.load(open(path, "r", encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError(f"{path} must be a JSON list of chunks")
    # keep dict chunks only
    return [c for c in data if isinstance(c, dict)]


def iter_docs(chunks: List[Dict[str, Any]], default_book: str, default_specialty: str) -> Iterable[Tuple[str, Dict[str, Any]]]:
    """
    Returns (text, metadata) pairs.
    """
    for i, c in enumerate(chunks):
        text = c.get("text") or ""
        text = _norm(text)
        if is_junk_text(text):
            continue

        meta = c.get("meta") or {}
        section = _norm(meta.get("section") or "")

        book_id = c.get("book_id") or default_book
        book_title = c.get("book_title") or ""
        page = c.get("page_number")

        md: Dict[str, Any] = {
            "book_id": str(book_id),
            "book_title": str(book_title),
            "specialty": default_specialty,
            "section": section if section else "",
            "page_number": int(page) if isinstance(page, int) else -1,
            "source_file": str(default_book),
        }
        yield text, md


def upsert_in_batches(col, docs: List[str], metas: List[Dict[str, Any]], ids: List[str], batch_size: int = 128) -> None:
    n = len(docs)
    for start in range(0, n, batch_size):
        end = min(start + batch_size, n)
        col.add(
            documents=docs[start:end],
            metadatas=metas[start:end],
            ids=ids[start:end],
        )


def reset_collection(client: chromadb.PersistentClient, name: str) -> None:
    # delete if exists
    try:
        client.delete_collection(name=name)
    except Exception:
        pass


def build_collection(
    client: chromadb.PersistentClient,
    name: str,
    items: List[Tuple[str, Dict[str, Any]]],
    reset: bool,
) -> None:
    if reset:
        reset_collection(client, name)

    col = client.get_or_create_collection(name=name)

    docs: List[str] = []
    metas: List[Dict[str, Any]] = []
    ids: List[str] = []

    for idx, (t, md) in enumerate(items):
        docs.append(t)
        metas.append(md)
        # Stable unique id: collection + running index + page_number
        ids.append(f"{name}::{md.get('book_id')}::{md.get('page_number')}::{idx}")

    print(f"\n== Building collection: {name}")
    print(f"   documents to add: {len(docs)}")

    if not docs:
        print("   (nothing to add)")
        return

    t0 = time.time()
    upsert_in_batches(col, docs, metas, ids, batch_size=128)
    dt = time.time() - t0

    # basic sanity
    try:
        count = col.count()
    except Exception:
        count = -1

    print(f"   done. count={count}, time={dt:.1f}s")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true", help="Delete and rebuild collections")
    args = ap.parse_args()

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit("OPENAI_API_KEY is not set in your environment.")

    BASE_CHROMA_DIR.mkdir(parents=True, exist_ok=True)

    embed_fn = OpenAIEmbeddingFunction(
        api_key=api_key,
        model_name=EMBED_MODEL,
    )

    # One persistent DB, multiple strict collections (best practice).
    client = chromadb.PersistentClient(path=str(BASE_CHROMA_DIR))
    # Attach embedding function per collection by setting it at creation time isn't supported directly in older APIs;
    # Instead we set it using collection metadata? The simplest stable approach: create collections then query-time embed.
    # However, Chroma expects embeddings at add() if no embedding function attached.
    # So we create collections with embedding function via client.get_or_create_collection(embedding_function=...)
    # We'll do that by creating a new client wrapper below.

    # Workaround: recreate collections with embedding_function each time we access:
    def getcol(nm: str):
        if args.reset:
            try:
                client.delete_collection(name=nm)
            except Exception:
                pass
        return client.get_or_create_collection(name=nm, embedding_function=embed_fn)

    # Load raw chunks
    harrison = load_chunks(HARRISON_JSON)
    dutta = load_chunks(DUTTA_JSON)
    surgery = load_chunks(SURGERY_JSON)
    peds = load_chunks(PEDS_JSON)
    mims = load_chunks(MIMS_JSON)
    kd = load_chunks(KD_JSON)

    # Prepare strict docs
    medicine_items = list(iter_docs(harrison, "harrison_22", "medicine"))
    obgyn_items = list(iter_docs(dutta, "dutta_obgyn", "obgyn"))
    surgery_items = list(iter_docs(surgery, "oxford_surgery", "surgery"))
    peds_items = list(iter_docs(peds, "oxford_pediatrics", "pediatrics"))

    drug_items = list(iter_docs(mims, "mims_2023_24", "drugs")) + list(iter_docs(kd, "kd_tripathi", "drugs"))

    # Build collections (strict)
    print("Chroma base:", BASE_CHROMA_DIR.resolve())
    print("Embedding model:", EMBED_MODEL)

    # Build using getcol (so embedding function is attached)
    for name, items in [
        ("medicine_harrison", medicine_items),
        ("obgyn_dutta", obgyn_items),
        ("surgery_oxford", surgery_items),
        ("pediatrics_oxford", peds_items),
        ("drugs_mims_kd", drug_items),
    ]:
        col = getcol(name)

        docs: List[str] = []
        metas: List[Dict[str, Any]] = []
        ids: List[str] = []
        for idx, (t, md) in enumerate(items):
            docs.append(t)
            metas.append(md)
            ids.append(f"{name}::{md.get('book_id')}::{md.get('page_number')}::{idx}")

        print(f"\n== Building collection: {name}")
        print(f"   documents to add: {len(docs)}")

        if not docs:
            print("   (nothing to add)")
            continue

        t0 = time.time()
        # add in batches
        bs = 128
        for start in range(0, len(docs), bs):
            end = min(start + bs, len(docs))
            col.add(
                documents=docs[start:end],
                metadatas=metas[start:end],
                ids=ids[start:end],
            )
        dt = time.time() - t0
        print(f"   done. count={col.count()}, time={dt:.1f}s")

    print("\n✅ DONE: All strict collections built in app/data/chroma")
    print("Collections:")
    for nm in ["medicine_harrison", "obgyn_dutta", "surgery_oxford", "pediatrics_oxford", "drugs_mims_kd"]:
        try:
            c = client.get_collection(name=nm)
            print(f" - {nm}: {c.count()}")
        except Exception as e:
            print(f" - {nm}: (error reading count) {e}")


if __name__ == "__main__":
    main()
