from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class Chunk:
    text: str
    meta: Dict[str, Any]


class ClinicalChunker:
    """
    Medical-grade chunker:
    - Accepts cleaned_text keyword (required by run_ingest.py)
    - Also accepts text keyword (compat)
    - Produces chunks with section-aware metadata
    - Keeps paragraphs intact as much as possible
    """

    def __init__(
        self,
        max_chars: int = 1800,
        overlap_chars: int = 200,
        min_chunk_chars: int = 250,
    ) -> None:
        self.max_chars = max_chars
        self.overlap_chars = overlap_chars
        self.min_chunk_chars = min_chunk_chars

    def chunk(
        self,
        cleaned_text: Optional[str] = None,
        text: Optional[str] = None,
        meta: Optional[Dict[str, Any]] = None,
        **_: Any,
    ) -> List[Dict[str, Any]]:
        """
        IMPORTANT: accepts cleaned_text=... (what your pipeline sends).
        Returns: List[{"text": str, "meta": dict}]
        """
        src = cleaned_text if cleaned_text is not None else text
        if not src:
            return []

        base_meta: Dict[str, Any] = dict(meta or {})

        # Normalize whitespace lightly
        src = src.replace("\r", "\n")
        src = re.sub(r"\n{3,}", "\n\n", src).strip()

        # Split into sections using headings when possible
        sections = self._split_into_sections(src)

        out: List[Dict[str, Any]] = []
        for section_title, section_text in sections:
            section_meta = dict(base_meta)
            if section_title:
                section_meta["section"] = section_title

            # Split section into paragraph blocks
            paras = [p.strip() for p in section_text.split("\n\n") if p.strip()]
            if not paras:
                continue

            # Pack paragraphs into chunks
            packed = self._pack_paragraphs(paras)

            # Emit
            for idx, ch in enumerate(packed):
                m = dict(section_meta)
                m["chunk_index_in_section"] = idx
                out.append({"text": ch, "meta": m})

        # If everything was tiny (rare), fallback to simple slicing
        if not out:
            for i, ch in enumerate(self._slice_fallback(src)):
                out.append({"text": ch, "meta": {**base_meta, "chunk_index": i, "section": "unspecified"}})

        return out

    # --------------------------
    # Internals
    # --------------------------

    def _split_into_sections(self, text: str) -> List[tuple[str, str]]:
        """
        Heuristics for headings:
        - Lines like "DIAGNOSIS", "TREATMENT", "CLINICAL FEATURES"
        - Lines like "Diagnosis" alone on a line
        - Numbered headings like "1. Definition"
        """
        lines = text.splitlines()

        def is_heading(line: str) -> bool:
            l = line.strip()
            if not l:
                return False

            # common medical headings (case-insensitive)
            common = [
                "definition", "classification", "epidemiology", "etiology", "pathogenesis",
                "pathophysiology", "clinical", "clinical features", "presentation",
                "diagnosis", "evaluation", "investigation", "investigations",
                "differential", "differential diagnosis",
                "management", "treatment", "therapy",
                "complications", "prognosis", "prevention", "screening", "follow-up",
                "drug", "adverse", "contraindications", "interactions",
            ]
            low = l.lower()

            # exact match to a known heading
            if low in common:
                return True

            # all caps headings (not too long)
            if len(l) <= 60 and l.isupper() and any(c.isalpha() for c in l):
                return True

            # Title Case short headings
            if len(l) <= 60 and re.fullmatch(r"[A-Z][A-Za-z0-9 \-/,&()]+", l):
                # avoid normal sentence fragments
                if low not in ("the", "and", "of", "in"):
                    return True

            # numbered headings
            if re.match(r"^\d+(\.\d+)*\s+[A-Z].{2,}$", l):
                return True

            return False

        sections: List[tuple[str, str]] = []
        current_title = ""
        buf: List[str] = []

        for line in lines:
            if is_heading(line):
                # flush previous
                if buf:
                    sections.append((current_title or "General", "\n".join(buf).strip()))
                    buf = []
                current_title = line.strip()
            else:
                buf.append(line)

        if buf:
            sections.append((current_title or "General", "\n".join(buf).strip()))

        # If the book page has no headings, keep as one section
        if len(sections) == 1 and sections[0][0] == "General":
            return sections

        # Remove tiny/empty sections created by noise
        cleaned: List[tuple[str, str]] = []
        for title, body in sections:
            body = body.strip()
            if len(body) < 50:
                continue
            cleaned.append((title, body))

        return cleaned if cleaned else [("General", text)]

    def _pack_paragraphs(self, paras: List[str]) -> List[str]:
        chunks: List[str] = []
        cur: List[str] = []
        cur_len = 0

        for p in paras:
            p_len = len(p) + (2 if cur else 0)
            if cur_len + p_len <= self.max_chars:
                cur.append(p)
                cur_len += p_len
                continue

            # flush current
            if cur:
                joined = "\n\n".join(cur).strip()
                if len(joined) >= self.min_chunk_chars:
                    chunks.append(joined)
                else:
                    # if too small, merge into previous if exists
                    if chunks:
                        chunks[-1] = (chunks[-1] + "\n\n" + joined).strip()
                    else:
                        chunks.append(joined)

            # start new with overlap from end of previous chunk
            cur = [p]
            cur_len = len(p)

        if cur:
            joined = "\n\n".join(cur).strip()
            if len(joined) >= self.min_chunk_chars:
                chunks.append(joined)
            else:
                if chunks:
                    chunks[-1] = (chunks[-1] + "\n\n" + joined).strip()
                else:
                    chunks.append(joined)

        # Add overlap by carrying tail text
        if self.overlap_chars > 0 and len(chunks) > 1:
            overlapped: List[str] = [chunks[0]]
            for i in range(1, len(chunks)):
                prev = overlapped[-1]
                tail = prev[-self.overlap_chars :] if len(prev) > self.overlap_chars else prev
                overlapped.append((tail + "\n\n" + chunks[i]).strip())
            return overlapped

        return chunks

    def _slice_fallback(self, text: str) -> List[str]:
        text = text.strip()
        out: List[str] = []
        step = max(1, self.max_chars - self.overlap_chars)

        i = 0
        while i < len(text):
            out.append(text[i : i + self.max_chars].strip())
            i += step
        return [x for x in out if x]
