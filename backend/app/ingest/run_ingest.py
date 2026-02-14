from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.ingest.loaders.pdf_loader import PDFLoader
from app.ingest.cleaners.text_cleaner import ClinicalTextCleaner
from app.ingest.chunkers.clinical_chunker import ClinicalChunker


# This file lives at: backend/app/ingest/run_ingest.py
# We want ROOT_APP = backend/app
ROOT_APP = Path(__file__).resolve().parents[1]

# Your manifest is at: backend/app/manifest.json (per your screenshot)
MANIFEST_PATH = ROOT_APP / "manifest.json"

DATA_DIR = ROOT_APP / "data"
RAW_CHUNKS_DIR = DATA_DIR / "raw_chunks"


@dataclass
class Book:
    book_id: str
    title: str
    pdf_path: str
    start_page_clinical: int = 1
    enabled: bool = True
    priority: int = 99
    domain: Optional[str] = None


def load_manifest() -> List[Book]:
    if not MANIFEST_PATH.exists():
        raise FileNotFoundError(f"manifest.json not found at: {MANIFEST_PATH}")

    obj = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    books: List[Book] = []
    for b in obj.get("books", []):
        books.append(
            Book(
                book_id=b["book_id"],
                title=b.get("title", b["book_id"]),
                pdf_path=b["pdf_path"],
                start_page_clinical=int(b.get("start_page_clinical", 1)),
                enabled=bool(b.get("enabled", True)),
                priority=int(b.get("priority", 99)),
                domain=b.get("domain"),
            )
        )
    return books


def resolve_pdf_path(pdf_path: str) -> Path:
    # pdf_path is relative like "pdfs/harrison_22.pdf"
    return (ROOT_APP / pdf_path).resolve()


def ingest_book(book: Book, max_pages: Optional[int]) -> None:
    pdf_path = resolve_pdf_path(book.pdf_path)

    if not pdf_path.exists():
        print(f"⚠️  SKIP (PDF missing): {book.book_id} -> {pdf_path}")
        return

    print(f"\n📘 Ingesting: {book.book_id}")
    print(f"   PDF: {pdf_path}")
    print(f"   Clinical start page: {book.start_page_clinical}")

    loader = PDFLoader(pdf_path)
    pages = loader.load()
    print(f"   Total pages in PDF: {len(pages)}")

    start = max(0, book.start_page_clinical - 1)
    end = len(pages) if max_pages is None else min(len(pages), start + max_pages)
    pages = pages[start:end]

    cleaner = ClinicalTextCleaner()
    chunker = ClinicalChunker()

    chunks: List[Dict[str, Any]] = []
    for p in pages:
        raw = (p.text or "").strip()
        if not raw:
            continue
        cleaned = cleaner.clean(raw)
        if not cleaned.strip():
            continue

        page_chunks = chunker.chunk(cleaned)
        for c in page_chunks:
            c["book_id"] = book.book_id
            c["book_title"] = book.title
            c["page_number"] = getattr(p, "page_number", None)
            chunks.append(c)

    RAW_CHUNKS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = RAW_CHUNKS_DIR / f"{book.book_id}_chunks.json"
    out_path.write_text(json.dumps(chunks, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"✅ Saved {len(chunks)} chunks -> {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--book", type=str, default=None, help="Ingest only one book_id")
    parser.add_argument("--max-pages", type=int, default=None, help="Limit pages ingested per book")
    parser.add_argument("--reset", action="store_true", help="(reserved) kept for compatibility")
    args = parser.parse_args()

    books = load_manifest()

    # Only enabled books
    books = [b for b in books if b.enabled]

    # Only one book if requested
    if args.book:
        books = [b for b in books if b.book_id == args.book]
        if not books:
            raise ValueError(f"Book '{args.book}' not found OR disabled in manifest.json")

    print(f"\n🚀 Starting ingestion for {len(books)} book(s)")
    for b in books:
        ingest_book(b, max_pages=args.max_pages)


if __name__ == "__main__":
    main()
