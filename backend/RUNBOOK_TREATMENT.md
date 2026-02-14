# Treatment Advisor Runbook

## Overview

The Treatment Advisor provides doctor-grade treatment recommendations based on:
- Multi-query retrieval (core treatment, severity/setting, special populations)
- Book priority (Harrison/Oxford for treatment recommendations, MIMS/Tripathi for dosing/brands)
- LLM-based structured extraction (RAG-only, no hallucination)
- Coverage gating to ensure evidence-backed regimens
- Indian brand suggestions from MIMS/KD Tripathi only

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
POST /api/treatment/plan?debug=true
Content-Type: application/json
```

## Curl Examples

### Basic Treatment Request

```bash
curl -sS -X POST "http://127.0.0.1:9000/api/treatment/plan" \
  -H "Content-Type: application/json" \
  -d '{
    "topic_or_diagnosis": "community acquired pneumonia",
    "context": {
      "age": 45,
      "sex": "male",
      "setting": "OPD",
      "severity": "moderate"
    },
    "confirmed_diagnosis": true,
    "source": "direct"
  }' | jq
```

### Treatment with Full Context

```bash
curl -sS -X POST "http://127.0.0.1:9000/api/treatment/plan?debug=true" \
  -H "Content-Type: application/json" \
  -d '{
    "topic_or_diagnosis": "heart failure with reduced ejection fraction",
    "context": {
      "age": 62,
      "sex": "male",
      "pregnancy": "no",
      "severity": "moderate",
      "setting": "OPD",
      "comorbidities": ["diabetes", "hypertension", "CKD stage 3"],
      "allergies": [],
      "renal_status": "CKD stage 3, eGFR 45",
      "hepatic_status": "normal",
      "current_meds": ["metformin", "amlodipine"]
    },
    "confirmed_diagnosis": true,
    "source": "ddx"
  }' | jq
```

### Minimal Request

```bash
curl -sS -X POST "http://127.0.0.1:9000/api/treatment/plan" \
  -H "Content-Type: application/json" \
  -d '{"topic_or_diagnosis": "acute asthma exacerbation"}' | jq
```

### With Allergy Consideration

```bash
curl -sS -X POST "http://127.0.0.1:9000/api/treatment/plan" \
  -H "Content-Type: application/json" \
  -d '{
    "topic_or_diagnosis": "community acquired pneumonia",
    "context": {
      "allergies": ["penicillin"],
      "setting": "OPD"
    }
  }' | jq
```

## Request Payload Schema

```json
{
  "topic_or_diagnosis": "string (required) - condition to treat",
  "context": {
    "age": "integer (optional)",
    "sex": "string (optional) - 'male'|'female'|'unknown'",
    "pregnancy": "string (optional) - 'yes'|'no'|'unknown'",
    "severity": "string (optional) - 'mild'|'moderate'|'severe'",
    "setting": "string (optional) - 'OPD'|'ER'|'ICU'|'ward'",
    "comorbidities": ["array of strings (optional)"],
    "allergies": ["array of strings (optional)"],
    "renal_status": "string (optional) - e.g., 'CKD stage 3'",
    "hepatic_status": "string (optional) - e.g., 'cirrhosis'",
    "current_meds": ["array of strings (optional)"]
  },
  "confirmed_diagnosis": "boolean (optional)",
  "source": "string (optional) - 'direct'|'ddx'"
}
```

## Response Schema

```json
{
  "topic": "community acquired pneumonia",
  
  "summary_plan": [
    "Empiric antibiotic therapy targeting common CAP pathogens",
    "Supportive care with hydration and antipyretics",
    "Monitor for clinical response at 48-72 hours"
  ],
  
  "first_line_regimens": [
    {
      "label": "Outpatient CAP - No comorbidities",
      "indication_notes": "Previously healthy, no antibiotic use in past 3 months",
      "drugs": [
        {
          "generic": "amoxicillin",
          "dose": "500mg",
          "route": "PO",
          "frequency": "TDS",
          "duration": "5-7 days",
          "weight_based": null,
          "renal_adjustment": "Reduce dose if CrCl <30",
          "hepatic_adjustment": null,
          "pregnancy_notes": "Category B - generally safe",
          "key_contraindications": [],
          "monitoring": []
        }
      ]
    },
    {
      "label": "Outpatient CAP - With comorbidities",
      "indication_notes": "Diabetes, CKD, or recent antibiotic use",
      "drugs": [
        {
          "generic": "amoxicillin-clavulanate",
          "dose": "625mg",
          "route": "PO",
          "frequency": "TDS",
          "duration": "5-7 days"
        },
        {
          "generic": "azithromycin",
          "dose": "500mg",
          "route": "PO",
          "frequency": "OD",
          "duration": "3 days"
        }
      ]
    }
  ],
  
  "second_line_regimens": [
    {
      "label": "Penicillin allergy",
      "indication_notes": "Alternative for penicillin-allergic patients",
      "drugs": [
        {
          "generic": "levofloxacin",
          "dose": "750mg",
          "route": "PO",
          "frequency": "OD",
          "duration": "5 days"
        }
      ]
    }
  ],
  
  "supportive_care": [
    "Adequate hydration",
    "Antipyretics for fever (paracetamol 500-1000mg Q6H PRN)",
    "Rest",
    "Smoking cessation counseling if applicable"
  ],
  
  "contraindications_and_cautions": [
    "Fluoroquinolones: avoid in pregnancy, risk of tendon rupture",
    "Macrolides: QT prolongation risk, especially with other QT-prolonging drugs"
  ],
  
  "monitoring": [
    "Clinical response at 48-72 hours",
    "Temperature, respiratory rate, oxygen saturation",
    "CXR if no improvement at 72 hours"
  ],
  
  "drug_interactions_flags": [
    {
      "drug": "metformin",
      "message": "No significant interaction with amoxicillin"
    }
  ],
  
  "red_flags_urgent_referral": [
    "Respiratory failure (SpO2 <90% on room air)",
    "Hemodynamic instability",
    "Altered mental status",
    "Multilobar involvement",
    "No improvement after 72 hours of antibiotics"
  ],
  
  "follow_up": [
    "Clinical reassessment at 48-72 hours",
    "Consider CXR in 4-6 weeks for smokers or age >50 to rule out underlying malignancy"
  ],
  
  "brands_india": [
    {
      "generic": "amoxicillin",
      "brand_names": ["Amoxil", "Mox", "Novamox"],
      "strengths": ["250mg", "500mg"],
      "forms": ["capsule", "suspension"],
      "price_notes": "Rs 50-80 per strip",
      "source": "MIMS",
      "evidence_chunk_ids": ["chunk_drug_1"]
    }
  ],
  
  "evidence": {
    "chunks": [
      {
        "chunk_id": "chunk_abc123",
        "excerpt": "For outpatient treatment of CAP, amoxicillin...",
        "book_id": "harrison",
        "section_path": "Pneumonia > Treatment",
        "page_start": 1234,
        "page_end": 1236,
        "score": 0.92
      }
    ],
    "coverage": {
      "pass": true,
      "missing": []
    }
  },
  
  "debug": {
    "llm_model": "gpt-4.1",
    "queries": {
      "treatment": ["CAP treatment first line regimen dose duration"],
      "drug": ["amoxicillin dose brand"]
    },
    "retrieval": {
      "core_raw": 35,
      "core_cleaned": 18,
      "drug_raw": 12,
      "drug_cleaned": 8
    }
  }
}
```

## Key Response Fields

### first_line_regimens
Primary treatment recommendations with:
- Label describing the regimen
- Indication notes (when to use)
- Drug details (generic, dose, route, frequency, duration)
- Renal/hepatic adjustments if mentioned in evidence

### second_line_regimens
Alternative treatments for:
- Drug allergies
- Treatment failure
- Specific patient populations

### brands_india
Indian brand suggestions **ONLY from MIMS/KD Tripathi evidence**:
- If no brand found in evidence → `"price_notes": "Not found in sources"`
- Never hallucinated brand names

### evidence.coverage
- `pass: true` → First-line regimen found in evidence
- `pass: false` → Insufficient evidence (check `missing` array)

## Debugging

### Check Debug Output

With `?debug=true`, the response includes:
- `llm_model`: Model used for extraction
- `queries.treatment`: Queries for core treatment evidence
- `queries.drug`: Queries for drug/brand evidence
- `retrieval`: Chunk counts at each stage

### Common Issues

1. **Empty first_line_regimens**: No treatment evidence found for topic
2. **Empty brands_india**: Drug not found in MIMS/Tripathi
3. **coverage.pass = false**: LLM couldn't extract regimen from evidence
4. **drug_interactions_flags**: Check for interactions with current_meds

## Running Tests

```bash
cd backend
python -m pytest tests/test_ddx_treatment.py -v
```

## Smoke Test Script

```bash
python backend/scripts/test_treatment.py
```

## Feature Flags

| Env Variable | Default | Description |
|--------------|---------|-------------|
| `OPENAI_API_KEY` | (required) | OpenAI API key |
| `OPENAI_CHAT_MODEL` | `gpt-4.1` | Model for LLM extraction |
| `RAG_TOPK_PER_QUERY` | `80` | Chunks per retrieval query |

## Architecture

```
Frontend (TreatmentAdvisor.tsx)
    │
    ▼ POST /api/treatment/plan
Backend (routes_treatment.py)
    │
    ▼ get_treatment_advice()
Service (services/treatment.py)
    │
    ├──► Core textbook retrieval (Harrison/Oxford)
    │        └──► Treatment recommendations
    │
    ├──► Drug book retrieval (MIMS/Tripathi)
    │        └──► Dosing, brands, formulations
    │
    ├──► Garbage filtering & reranking
    │
    └──► LLM extraction (extractors/treatment_extractor.py)
             ├──► Regimen structuring
             └──► Brand extraction (separate LLM call)
```

## Book Priority

1. **Harrison's** - Treatment of choice, guidelines
2. **Oxford Clinical Medicine** - Treatment algorithms
3. **Specialty books** (Surgery, Pediatrics, OBGYN) - Domain-specific
4. **MIMS / KD Tripathi** - Dosing, formulations, Indian brands

Drug books should NOT override treatment recommendations from clinical books.
