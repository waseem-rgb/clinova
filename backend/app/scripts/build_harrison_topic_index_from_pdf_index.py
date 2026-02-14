from __future__ import annotations

import argparse
import json
import os
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import chromadb

OUT_PATH = Path("app/data/topic_index_harrison.json")

CHROMA_DIR = os.getenv("CHROMA_DIR", "app/data/chroma")
COLLECTION = "medicine_harrison"


def norm_space(s: str) -> str:
    return " ".join((s or "").replace("\u00a0", " ").strip().split())


def strip_see_also(s: str) -> str:
    return re.sub(r"\bSee also\b.*$", "", s, flags=re.IGNORECASE).strip()


def extract_page_numbers(s: str) -> List[int]:
    """
    Harrison index uses numbers plus suffixes:
      3408, 521, 901
      123f, 456t, 789S, 6161f
    We keep digits only.
    """
    nums: List[int] = []
    for m in re.finditer(r"\b(\d{1,4})(?:[A-Za-z])?\b", s):
        try:
            nums.append(int(m.group(1)))
        except Exception:
            pass
    return nums


def looks_like_main_entry(line: str) -> bool:
    """
    Main index entries are usually left-aligned.
    Sub-entries are indented.
    """
    if not line:
        return False

    # subentry indentation (pdf text extraction often preserves leading spaces)
    if line.startswith(" "):
        return False

    # ignore alphabet headers like "A", "B", etc.
    if re.fullmatch(r"[A-Z]$", line.strip()):
        return False

    # ignore section header
    if line.strip().lower() in {"index"}:
        return False

    # ignore long explainer lines
    if len(line) > 140:
        return False

    return True


def clean_topic_title(raw: str) -> Optional[str]:
    raw = norm_space(raw)
    raw = strip_see_also(raw)
    raw = raw.strip(" ,;:-")

    if not raw:
        return None

    # drop index preface / boilerplate
    if "page numbers" in raw.lower():
        return None

    # too sentence-like
    if len(raw.split()) > 10:
        return None

    # avoid fragments that start with conjunctions/prepositions
    if raw.lower().startswith(("of ", "in ", "and ", "the ", "for ")):
        return None

    # remove trailing punctuation
    raw = raw.rstrip(" ,;:-").strip()

    if len(raw) < 3:
        return None

    return raw


def parse_index_lines(text: str) -> List[Tuple[str, List[int]]]:
    """
    Extract (topic, pages) pairs from index pages text.
    We keep only MAIN entries.
    """
    results: List[Tuple[str, List[int]]] = []

    lines = [norm_space(ln) for ln in (text or "").splitlines()]
    for ln in lines:
        if not ln:
            continue
        if not looks_like_main_entry(ln):
            continue

        pages = extract_page_numbers(ln)
        if not pages:
            continue

        # title = everything before first number
        m = re.search(r"\b\d{1,4}\b", ln)
        if not m:
            continue

        title_part = ln[: m.start()].strip().rstrip(",").strip()
        title = clean_topic_title(title_part)
        if not title:
            continue

        results.append((title, sorted(set(pages))))

    return results


def read_pdf_text_pdfplumber(pdf_path: str, start_page: int, end_page: int) -> str:
    """
    start_page/end_page are 1-indexed inclusive.
    Uses pdfplumber (pdfminer.six) for reliable macOS installs.
    """
    try:
        import pdfplumber
    except Exception as e:
        raise RuntimeError("pdfplumber is required. Install with: python3 -m pip install pdfplumber pdfminer.six") from e

    parts: List[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        n = len(pdf.pages)
        if start_page < 1 or end_page < 1 or start_page > n or end_page > n or start_page > end_page:
            raise ValueError(f"Invalid page range. PDF has {n} pages. Got {start_page}-{end_page}.")

        for i in range(start_page - 1, end_page):
            page = pdf.pages[i]
            txt = page.extract_text() or ""
            parts.append(txt)

    return "\n".join(parts)


def get_page_key(meta: Dict[str, Any]) -> Optional[int]:
    for k in ("page", "pdf_page", "page_number", "pageno"):
        v = meta.get(k)
        if isinstance(v, int):
            return v
        if isinstance(v, str) and v.isdigit():
            return int(v)
    return None


def map_topics_to_chunks(topic_pages: Dict[str, Set[int]]) -> Dict[str, List[str]]:
    """
    Map topic -> chunk_ids by matching metadata page numbers.
    Uses +/- 1 page buffer.
    """
    client = chromadb.PersistentClient(path=CHROMA_DIR)
    col = client.get_collection(COLLECTION)

    data = col.get(include=["metadatas"])
    ids: List[str] = data.get("ids") or []
    metas: List[Dict[str, Any]] = data.get("metadatas") or []

    page_to_ids: Dict[int, List[str]] = defaultdict(list)
    for cid, meta in zip(ids, metas):
        meta = meta or {}
        p = get_page_key(meta)
        if p is None:
            continue
        page_to_ids[int(p)].append(cid)

    topic_to_chunk_ids: Dict[str, List[str]] = {}
    for topic, pages in topic_pages.items():
        chunk_ids: List[str] = []
        for p in pages:
            for pp in (p - 1, p, p + 1):
                if pp in page_to_ids:
                    chunk_ids.extend(page_to_ids[pp])

        # de-dupe
        seen = set()
        out: List[str] = []
        for x in chunk_ids:
            if x in seen:
                continue
            seen.add(x)
            out.append(x)
        topic_to_chunk_ids[topic] = out

    return topic_to_chunk_ids


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True, help="Path to Harrison PDF (22e).")
    ap.add_argument("--index_start", type=int, required=True, help="Index start page (1-indexed).")
    ap.add_argument("--index_end", type=int, required=True, help="Index end page (1-indexed).")
    args = ap.parse_args()

    pdf_path = args.pdf
    start_page = args.index_start
    end_page = args.index_end

    print(f"Reading PDF index pages {start_page}-{end_page} from: {pdf_path}")
    text = read_pdf_text_pdfplumber(pdf_path, start_page, end_page)

    pairs = parse_index_lines(text)
    print(f"Extracted raw main entries: {len(pairs)}")

    topic_pages: Dict[str, Set[int]] = defaultdict(set)
    for topic, pages in pairs:
        for p in pages:
            topic_pages[topic].add(p)

    print(f"Unique topics: {len(topic_pages)}")

    print("Mapping topics -> chunk_ids using Chroma metadatas (page match ±1)...")
    topic_to_chunk_ids = map_topics_to_chunks(topic_pages)

    topics = []
    for topic in sorted(topic_pages.keys(), key=lambda x: x.lower()):
        pages_sorted = sorted(topic_pages[topic])
        topics.append(
            {
                "display_title": topic,
                "collection": COLLECTION,
                "pages": pages_sorted,
                "chunk_ids": topic_to_chunk_ids.get(topic, []),
            }
        )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps({"topics": topics}, indent=2), encoding="utf-8")

    print(f"✅ Wrote topic index: {OUT_PATH} (topics={len(topics)})")
    print("Sample (first 25):")
    for t in topics[:25]:
        print(" -", t["display_title"], f"(pages={len(t['pages'])}, chunks={len(t['chunk_ids'])})")


if __name__ == "__main__":
    main()
