import re
from typing import List


class ClinicalTextCleaner:
    """
    Deterministic, medical-safe text cleaner.
    Removes layout noise ONLY.
    Does NOT summarize, infer, or delete medical meaning.
    """

    HEADER_PATTERNS = [
        r"^CHAPTER\s+\d+.*$",
        r"^\d+\s+CHAPTER\s+.*$",
        r"^PART\s+\d+.*$",
        r"^SECTION\s+.*$",
        r"^HARRISON.*$",
        r"^OXFORD.*$",
        r"^MIMS.*$",
    ]

    FOOTER_PATTERNS = [
        r"^\d+$",  # page numbers alone
        r"^Page\s+\d+.*$",
        r"^Printed in.*$",
        r"^ISBN.*$",
        r"^Copyright.*$",
        r"^All rights reserved.*$",
    ]

    JUNK_BLOCKS = [
        "DETAILED CONTENTS",
        "CONTENTS",
        "INDEX",
        "CONTRIBUTORS",
        "ACKNOWLEDGEMENTS",
        "PREFACE",
        "SYMBOLS AND ABBREVIATIONS",
        "This page intentionally left blank",
    ]

    @staticmethod
    def _remove_headers_footers(lines: List[str]) -> List[str]:
        cleaned = []
        for line in lines:
            l = line.strip()

            if not l:
                cleaned.append("")
                continue

            if any(re.match(pat, l, re.IGNORECASE) for pat in ClinicalTextCleaner.HEADER_PATTERNS):
                continue

            if any(re.match(pat, l, re.IGNORECASE) for pat in ClinicalTextCleaner.FOOTER_PATTERNS):
                continue

            if any(junk.lower() in l.lower() for junk in ClinicalTextCleaner.JUNK_BLOCKS):
                continue

            cleaned.append(line)

        return cleaned

    @staticmethod
    def _fix_hyphenation(text: str) -> str:
        # Fix words split across line breaks: hemo-\n globin → hemoglobin
        return re.sub(r"(\w+)-\n(\w+)", r"\1\2", text)

    @staticmethod
    def _normalize_whitespace(text: str) -> str:
        # Normalize spacing but keep paragraphs
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r"[ \t]+", " ", text)
        return text.strip()

    @classmethod
    def clean(cls, raw_text: str) -> str:
        lines = raw_text.splitlines()
        lines = cls._remove_headers_footers(lines)
        text = "\n".join(lines)
        text = cls._fix_hyphenation(text)
        text = cls._normalize_whitespace(text)
        return text
