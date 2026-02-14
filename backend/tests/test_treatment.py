from __future__ import annotations

from typing import Dict, List

from app.api.schemas import TreatmentAdvisorResponse
from app.services import treatment as treatment_service


def _fake_retrieve_chunks(*, query: str, collection_key: str, top_k: int = 8) -> List[Dict[str, str]]:
    if collection_key == "core_textbooks":
        return [
            {
                "chunk_id": "c1",
                "text": "Treatment of choice is drug A 500 mg oral daily for 5 days. Monitor response.",
                "score": 0.9,
                "collection": "medicine_harrison",
                "book": "Harrison",
                "book_id": "harrison",
                "section_path": "Treatment",
                "page_start": 12,
                "page_end": 12,
            }
        ]
    if collection_key == "drugs_mims":
        return [
            {
                "chunk_id": "m1",
                "text": "DrugA BrandX [Company] 500 mg tablet",
                "score": 0.8,
                "collection": "drugs_mims_kd",
                "book": "MIMS",
                "book_id": "mims",
                "section_path": "DrugA",
                "page_start": 1,
                "page_end": 1,
            }
        ]
    return []


def test_treatment_schema(monkeypatch):
    monkeypatch.setattr(treatment_service, "retrieve_chunks", _fake_retrieve_chunks)
    payload = {
        "topic_or_diagnosis": "test condition",
        "context": {"age": 50, "sex": "male"},
        "confirmed_diagnosis": True,
        "source": "direct",
    }
    res = treatment_service.get_treatment_advice(payload, debug=True)
    TreatmentAdvisorResponse(**res)
    assert res["first_line_regimens"], "Expected first-line regimen"
    assert res["evidence"]["coverage"]["pass"] is True
