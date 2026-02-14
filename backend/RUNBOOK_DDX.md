# Differential Diagnosis (DDx) Runbook

## Overview

The DDx feature provides doctor-grade differential diagnosis based on:
- Multi-query retrieval (syndromic, red flags, workup)
- Book priority (Harrison/Oxford first)
- LLM-based structured extraction (RAG-only, no hallucination)
- Garbage filtering and deduplication
- Coverage gating

## Start Backend

```bash
cd backend
uvicorn app.main:app --reload --reload-dir app --port 9000
```

## Start Frontend

```bash
cd frontend
npm run dev -- --port 5173
```

## API Endpoint

```
POST /ddx/run?debug=true
Content-Type: application/json
```

## Curl Examples

### Basic DDx Request

```bash
curl -sS -X POST "http://127.0.0.1:9000/ddx/run" \
  -H "Content-Type: application/json" \
  -d '{
    "symptoms": "fever, shortness of breath",
    "duration": "3 days",
    "age": 50,
    "sex": "male",
    "pregnancy": "no",
    "comorbidities": ["diabetes"],
    "meds": ["metformin"]
  }' | jq
```

### DDx with Debug Mode

```bash
curl -sS -X POST "http://127.0.0.1:9000/ddx/run?debug=true" \
  -H "Content-Type: application/json" \
  -d '{
    "symptoms": "chest pain, shortness of breath",
    "duration": "2 hours",
    "age": 54,
    "sex": "male",
    "pregnancy": "no",
    "comorbidities": ["hypertension", "diabetes"],
    "meds": ["ACE inhibitor", "metformin"]
  }' | jq
```

### Minimal Request (Symptoms Only)

```bash
curl -sS -X POST "http://127.0.0.1:9000/ddx/run" \
  -H "Content-Type: application/json" \
  -d '{"symptoms": "headache, fever, neck stiffness"}' | jq
```

## Request Payload Schema

```json
{
  "symptoms": "string (required) - comma-separated symptoms",
  "duration": "string (optional) - e.g., '3 days', '2 weeks'",
  "age": "integer (optional)",
  "sex": "string (optional) - 'male'|'female'|'unknown'",
  "pregnancy": "string (optional) - 'yes'|'no'|'unknown'",
  "comorbidities": ["array of strings (optional)"],
  "meds": ["array of strings (optional)"]
}
```

## Response Schema

```json
{
  "input_summary": {
    "symptoms": "fever, shortness of breath",
    "duration": "3 days",
    "age": 50,
    "sex": "male",
    "pregnancy": "no",
    "comorbidities": ["diabetes"],
    "meds": ["metformin"],
    "normalized_symptoms": ["fever", "shortness of breath"]
  },
  
  "must_not_miss": [
    {
      "diagnosis": "Sepsis / Septic shock",
      "key_clues": ["hypotension", "altered mental status", "tachycardia"],
      "immediate_actions": ["Blood cultures", "IV antibiotics within 1 hour", "IV fluids"],
      "evidence_ids": []
    }
  ],
  
  "ranked_ddx": [
    {
      "diagnosis": "Community acquired pneumonia",
      "likelihood": "high",
      "for": ["fever with cough", "tachypnea"],
      "against": ["no infiltrate on CXR"],
      "discriminating_tests": ["CXR", "procalcitonin", "sputum culture"],
      "initial_management": ["Empiric antibiotics", "oxygen if hypoxic"],
      "evidence_ids": ["chunk_123"]
    }
  ],
  
  "system_wise": [
    {
      "system": "Respiratory",
      "items": [
        {
          "diagnosis": "Pneumonia",
          "key_points": ["fever", "productive cough"],
          "evidence_ids": []
        }
      ]
    },
    {
      "system": "Infectious",
      "items": [
        {
          "diagnosis": "Sepsis",
          "key_points": ["systemic inflammatory response"],
          "evidence_ids": []
        }
      ]
    }
  ],
  
  "rapid_algorithm": {
    "step_1": ["Vitals and oxygen saturation", "ECG", "CXR", "Basic labs (CBC, CMP)"],
    "step_2": ["Blood cultures if febrile", "Procalcitonin", "Consider CT chest"],
    "step_3": ["Empiric antibiotics if clinical suspicion high", "Admit if unstable"]
  },
  
  "suggested_investigations": {
    "urgent": ["ECG", "Troponin", "CXR"],
    "soon": ["CBC", "CMP", "Procalcitonin"],
    "routine": ["Sputum culture", "Urinalysis"]
  },
  
  "red_flags": [
    "Hemodynamic instability (hypotension, tachycardia)",
    "Altered mental status",
    "Oxygen saturation <90%",
    "Signs of sepsis (lactate >2, hypotension)"
  ],
  
  "evidence": [
    {
      "id": "chunk_abc123",
      "snippet": "Community-acquired pneumonia (CAP) is defined as...",
      "source": {
        "title": "Harrison's Principles of Internal Medicine",
        "section": "Pneumonia",
        "page_start": 1234,
        "page_end": 1236
      }
    }
  ],
  
  "coverage_gate": {
    "passed": true,
    "missing_evidence_ids": []
  },
  
  "debug": {
    "llm_model": "gpt-4.1",
    "queries": [
      "fever shortness of breath differential diagnosis",
      "fever shortness of breath red flags emergency"
    ],
    "retrieval": {
      "raw_count": 48,
      "context_filtered": 12,
      "garbage_filtered": 8,
      "final_count": 28
    },
    "normalized_symptoms": ["fever", "shortness of breath"]
  }
}
```

## Key Response Fields

### must_not_miss
Emergency diagnoses that must be ruled out first. Based on symptom cluster matching against a curated library of life-threatening conditions.

### ranked_ddx
Working differential diagnosis ranked by likelihood. Each entry includes:
- Supporting features ("for")
- Features that argue against
- Discriminating tests to differentiate
- Initial management steps

### system_wise
Differential organized by organ system (Cardiovascular, Respiratory, Infectious, etc.)

### rapid_algorithm
Stepwise diagnostic approach:
- Step 1: Immediate bedside actions (within 1 hour)
- Step 2: Next steps (1-4 hours)
- Step 3: If diagnosis still unclear

### coverage_gate
Indicates if all referenced evidence IDs are present. If `passed: false`, some diagnoses may not have supporting evidence.

## Debugging

### Check Debug Output

With `?debug=true`, the response includes:
- `llm_model`: Model used for extraction
- `queries`: Retrieval queries generated
- `retrieval`: Counts of chunks at each filtering stage
- `normalized_symptoms`: How symptoms were interpreted

### Common Issues

1. **Empty must_not_miss**: Symptom cluster doesn't match any emergency patterns
2. **Empty ranked_ddx**: Retrieval returned no relevant chunks, or LLM extraction failed
3. **coverage_gate.passed = false**: Some evidence IDs referenced but not in evidence list
4. **Garbage in output**: Check if garbage patterns are in source chunks (run with debug to see)

## Running Tests

```bash
cd backend
python -m pytest tests/test_ddx_treatment.py -v
```

## Smoke Test Script

```bash
python backend/scripts/test_ddx.py
```

## Feature Flags

| Env Variable | Default | Description |
|--------------|---------|-------------|
| `OPENAI_API_KEY` | (required) | OpenAI API key |
| `OPENAI_CHAT_MODEL` | `gpt-4.1` | Model for LLM extraction |
| `RAG_TOPK_PER_QUERY` | `80` | Chunks per retrieval query |
| `RAG_MAX_UNIQUE_SOURCES` | `220` | Max unique chunks to process |

## Architecture

```
Frontend (DifferentialDiagnosis.tsx)
    │
    ▼ POST /ddx/run
Backend (routes_ddx.py)
    │
    ▼ run_ddx()
Service (services/ddx.py)
    │
    ├──► Multi-query retrieval (retrieve/query.py)
    │        └──► ChromaDB collections (core_textbooks)
    │
    ├──► Context filtering (age, pregnancy, etc.)
    │
    ├──► Garbage filtering & reranking (cleaners/text_cleaner.py)
    │
    └──► LLM extraction (extractors/ddx_extractor.py)
             └──► OpenAI GPT-4
```
