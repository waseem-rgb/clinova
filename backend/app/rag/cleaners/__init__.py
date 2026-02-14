# backend/app/rag/cleaners/__init__.py
"""Retrieval-time text cleaning and filtering."""

from .text_cleaner import (
    is_garbage_chunk,
    clean_chunk_text,
    compute_content_hash,
    dedupe_chunks_by_content,
    compute_relevance_score,
    filter_and_clean_chunks,
    get_book_priority,
    sort_by_book_priority,
    DDX_BOOST_TERMS,
    TREATMENT_BOOST_TERMS,
)

__all__ = [
    "is_garbage_chunk",
    "clean_chunk_text",
    "compute_content_hash",
    "dedupe_chunks_by_content",
    "compute_relevance_score",
    "filter_and_clean_chunks",
    "get_book_priority",
    "sort_by_book_priority",
    "DDX_BOOST_TERMS",
    "TREATMENT_BOOST_TERMS",
]
