# Drug Details Feature - Runbook

## Overview

The Drug Details feature provides comprehensive drug information by querying the medical RAG corpus (MIMS, Tripathi pharmacology textbooks) and using LLM extraction to produce structured, doctor-grade output.

## Architecture

```
Frontend (DrugDetails.tsx)
    ↓ POST /drugs/details
Backend (routes_drugs.py)
    ↓
Service (drugs_details.py)
    ↓
┌──────────────────────────────────────┐
│  Multi-Query Retrieval Strategy     │
│  - Drug name + pharmacology         │
│  - Drug name + dosing               │
│  - Drug name + interactions ADRs    │
│  - Drug name + brands India         │
└──────────────────────────────────────┘
    ↓
text_cleaner.py (garbage removal, dedup, book priority sort)
    ↓
drug_details_extractor.py (LLM-based structured extraction)
    ↓
JSON response → Frontend rendering
```

## Files

| File | Purpose |
|------|---------|
| `frontend/src/pages/DrugDetails.tsx` | React page with InlineSuggestInput, state persistence |
| `backend/app/api/routes_drugs.py` | API endpoint `/drugs/details` |
| `backend/app/services/drugs_details.py` | Service orchestrating retrieval + extraction |
| `backend/app/rag/extractors/drug_details_extractor.py` | LLM extractor with structured prompts |
| `backend/app/rag/cleaners/text_cleaner.py` | Garbage pattern removal, deduplication |
| `frontend/src/app/lib/searchMemory.ts` | State persistence for inputs/outputs |
| `frontend/src/components/InlineSuggestInput.tsx` | Inline autocomplete component |

## API Contract

### Request
```http
POST /drugs/details
Content-Type: application/json

{
  "drug_name": "metformin",
  "context": {                  // optional
    "indication": "type 2 diabetes",
    "patient_age": 55,
    "renal_status": "CKD stage 3"
  }
}
```

### Response
```json
{
  "drug_name": "Metformin",
  "class": "Biguanide antidiabetic",
  "mechanism": "Decreases hepatic glucose production...",
  "indications": ["Type 2 diabetes mellitus", "PCOS"],
  "contraindications": ["Severe renal impairment (eGFR <30)", "Metabolic acidosis"],
  "dosing": {
    "adult": "500-2000 mg/day in divided doses",
    "pediatric": "Not typically used in children <10 years",
    "renal_adjustment": "Reduce dose if eGFR 30-45; avoid if <30",
    "hepatic_adjustment": "Avoid in severe hepatic impairment"
  },
  "adverse_effects": {
    "common": ["GI upset", "Diarrhea", "Metallic taste"],
    "serious": ["Lactic acidosis (rare)", "Vitamin B12 deficiency"]
  },
  "interactions": [
    {
      "drug": "Contrast media",
      "severity": "major",
      "effect": "Risk of contrast-induced nephropathy and lactic acidosis"
    }
  ],
  "monitoring": ["Renal function annually", "Vitamin B12 levels"],
  "pregnancy_lactation": {
    "pregnancy": "Category B - may be used in gestational diabetes",
    "lactation": "Present in breast milk; considered compatible"
  },
  "india_brands": [
    {
      "name": "Glycomet",
      "manufacturer": "USV",
      "strengths": ["500mg", "850mg", "1000mg"]
    }
  ],
  "evidence": [
    {
      "id": "ev_001",
      "source": {"title": "MIMS India 2023-24", "page_start": 245},
      "snippet": "Metformin is the first-line oral agent..."
    }
  ],
  "coverage_gate": {
    "passed": true,
    "missing_evidence_ids": []
  }
}
```

## Troubleshooting

### No results / empty response
1. Check if drug name is spelled correctly
2. Verify Chroma collection has drug chunks: `python -c "from backend.app.rag.query_engine import get_collection; print(len(get_collection().get()))"`
3. Check logs for retrieval count: `grep "retrieved" logs/app.log`

### Garbage text in output
1. Check `text_cleaner.py` GARBAGE_PATTERNS for missing patterns
2. Run test: `python -c "from backend.app.rag.cleaners.text_cleaner import clean; print(clean('test See also'))"`
3. Add new patterns as case-insensitive regex

### LLM extraction fails
1. Check OpenAI API key is set: `echo $OPENAI_API_KEY`
2. Check rate limits in logs
3. Verify prompt template in `drug_details_extractor.py`

### India brands not showing
1. Check `india_brands.json` has the drug
2. MIMS collection should have brand data
3. Verify DRUG_BOOST_TERMS in text_cleaner includes brand-related terms

## Debug Commands

```bash
# Test drug details endpoint
curl -X POST http://localhost:8000/drugs/details \
  -H "Content-Type: application/json" \
  -d '{"drug_name": "metformin"}'

# Test retrieval only
python -c "
from backend.app.services.drugs_details import DrugDetailsService
svc = DrugDetailsService()
chunks = svc._retrieve_chunks('metformin')
print(f'Retrieved {len(chunks)} chunks')
for c in chunks[:3]:
    print(f'- {c.metadata.get(\"book_id\")} p{c.metadata.get(\"page_start\")}: {c.page_content[:100]}...')
"

# Test cleaner
python -c "
from backend.app.rag.cleaners.text_cleaner import clean_chunks_for_feature
from langchain.schema import Document
docs = [Document(page_content='See also: Diabetes\nMetformin is effective...', metadata={'book_id': 'test'})]
cleaned = clean_chunks_for_feature(docs, 'drug')
print(cleaned[0].page_content)
"
```

## Performance

| Metric | Target | Typical |
|--------|--------|---------|
| API response time | < 3s | 1.5-2.5s |
| Chunks retrieved | 10-20 | 15 |
| LLM tokens | < 4000 | 2000-3000 |

## Monitoring

- Log level: Set `LOG_LEVEL=DEBUG` for verbose retrieval logging
- Metrics: Track `/drugs/details` latency in APM
- Alerts: Set up alert for > 5s response time or > 10% error rate
