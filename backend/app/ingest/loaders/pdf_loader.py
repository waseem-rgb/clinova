# backend/app/ingest/loaders/pdf_loader.py

from pathlib import Path
from typing import List, Dict
import fitz  # PyMuPDF


class PDFPage:
    """
    Represents a single PDF page with raw extracted text.
    NO cleaning, NO chunking, NO AI here.
    """
    def __init__(self, page_number: int, text: str):
        self.page_number = page_number
        self.text = text

    def to_dict(self) -> Dict:
        return {
            "page_number": self.page_number,
            "text": self.text
        }


class PDFLoader:
    """
    Medical-grade PDF loader.
    Extracts text page-by-page while preserving order.
    """

    def __init__(self, pdf_path: Path):
        if not pdf_path.exists():
            raise FileNotFoundError(f"PDF not found: {pdf_path}")
        if pdf_path.suffix.lower() != ".pdf":
            raise ValueError("File must be a PDF")

        self.pdf_path = pdf_path

    def load(self) -> List[PDFPage]:
        pages: List[PDFPage] = []

        doc = fitz.open(self.pdf_path)

        for page_index in range(len(doc)):
            page = doc[page_index]

            # Extract text in reading order
            text = page.get_text("text")

            # Normalize basic whitespace (NOT cleaning content)
            text = text.replace("\r", "\n")

            pages.append(
                PDFPage(
                    page_number=page_index + 1,
                    text=text
                )
            )

        doc.close()
        return pages
