# Drug Interactions Feature - Runbook

## Overview

The Drug Interactions feature analyzes potential interactions between multiple drugs by querying the medical RAG corpus and using LLM extraction to identify clinically significant drug-drug interactions with severity levels and management recommendations.

## Architecture

```
Frontend (DrugInteractions.tsx)
    ↓ POST /interactions/check
Backend (routes_interactions.py)
    ↓
Service (interactions.py)
    ↓
┌──────────────────────────────────────┐
│  Pairwise Query Strategy            │
│  For drugs [A, B, C]:               │
│  - "A B interaction"                │
│  - "A C interaction"                │
│  - "B C interaction"                │
│  Plus risk cluster queries:         │
│  - QT prolongation                  │
│  - Bleeding risk                    │
│  - Serotonin toxicity               │
│  - CNS depression                   │
│  - Nephrotoxicity                   │
│  - Hyperkalemia                     │
└──────────────────────────────────────┘
    ↓
text_cleaner.py (garbage removal, dedup)
    ↓
drug_interactions_extractor.py (LLM extraction with risk clusters)
    ↓
JSON response → Frontend severity color-coded rendering
```

## Files

| File | Purpose |
|------|---------|
| `frontend/src/pages/DrugInteractions.tsx` | React page with multi-drug input, severity badges |
| `backend/app/api/routes_interactions.py` | API endpoint `/interactions/check` |
| `backend/app/services/interactions.py` | Service orchestrating pairwise retrieval + extraction |
| `backend/app/rag/extractors/drug_interactions_extractor.py` | LLM extractor with RISK_CLUSTERS |
| `backend/app/rag/cleaners/text_cleaner.py` | Garbage pattern removal, deduplication |
| `backend/app/data/rules/interactions_rules.json` | Static interaction rules (if available) |
| `frontend/src/app/lib/searchMemory.ts` | State persistence for inputs/outputs |
| `frontend/src/components/InlineSuggestInput.tsx` | Multi-value inline autocomplete |

## Risk Clusters

The extractor identifies drugs belonging to known risk clusters:

| Cluster | Drugs (examples) | Risk |
|---------|-----------------|------|
| QT Prolongation | amiodarone, haloperidol, ondansetron, azithromycin | Torsades de pointes |
| Bleeding | warfarin, aspirin, NSAIDs, SSRIs, clopidogrel | Hemorrhage |
| Serotonin Toxicity | SSRIs, SNRIs, tramadol, MAOIs, linezolid | Serotonin syndrome |
| CNS Depression | opioids, benzodiazepines, gabapentin, alcohol | Respiratory depression |
| Nephrotoxicity | NSAIDs, ACE inhibitors, aminoglycosides, contrast | Acute kidney injury |
| Hyperkalemia | ACE inhibitors, ARBs, potassium-sparing diuretics | Cardiac arrhythmia |

## API Contract

### Request
```http
POST /interactions/check
Content-Type: application/json

{
  "drugs": ["warfarin", "aspirin", "omeprazole"],
  "context": {                  // optional
    "patient_age": 70,
    "renal_status": "CKD stage 3"
  }
}
```

### Response
```json
{
  "drugs_analyzed": ["warfarin", "aspirin", "omeprazole"],
  "interactions": [
    {
      "pair": ["warfarin", "aspirin"],
      "severity": "major",
      "mechanism": "Aspirin inhibits platelet aggregation and may displace warfarin from albumin",
      "clinical_effect": "Increased risk of bleeding, including GI and intracranial hemorrhage",
      "management": "Avoid combination if possible. If necessary, use lowest aspirin dose (81mg), monitor INR closely, consider PPI for GI protection",
      "evidence_ids": ["ev_001", "ev_002"]
    },
    {
      "pair": ["warfarin", "omeprazole"],
      "severity": "moderate",
      "mechanism": "Omeprazole inhibits CYP2C19, potentially affecting warfarin metabolism",
      "clinical_effect": "May increase or decrease warfarin effect",
      "management": "Monitor INR when starting or stopping omeprazole",
      "evidence_ids": ["ev_003"]
    }
  ],
  "risk_cluster_alerts": [
    {
      "cluster": "bleeding",
      "drugs_involved": ["warfarin", "aspirin"],
      "alert": "Multiple anticoagulant/antiplatelet agents: High bleeding risk"
    }
  ],
  "summary": {
    "total_interactions": 2,
    "major": 1,
    "moderate": 1,
    "minor": 0,
    "recommendation": "Review warfarin + aspirin combination; ensure clinical benefit outweighs bleeding risk"
  },
  "evidence": [
    {
      "id": "ev_001",
      "source": {"title": "KD Tripathi Pharmacology", "page_start": 612},
      "snippet": "Aspirin increases bleeding risk when combined with warfarin..."
    }
  ],
  "coverage_gate": {
    "passed": true,
    "missing_pairs": []
  }
}
```

## Severity Levels

| Severity | Color | Description |
|----------|-------|-------------|
| `contraindicated` | 🔴 Red | Combination should be avoided |
| `major` | 🟠 Orange | Clinically significant, close monitoring required |
| `moderate` | 🟡 Yellow | May require dose adjustment or monitoring |
| `minor` | 🟢 Green | Minimal clinical significance |

## Troubleshooting

### No interactions found
1. Verify drugs are spelled correctly
2. Check if drug aliases exist in `drugs_alias_index.json`
3. Review retrieval logs for chunk counts
4. Some combinations may genuinely have no documented interactions

### Missing severity classification
1. Check LLM prompt for severity extraction
2. Verify evidence quality in retrieved chunks
3. Default to "unknown" if evidence insufficient

### Risk cluster not detected
1. Check `RISK_CLUSTERS` dict in `drug_interactions_extractor.py`
2. Drug names must match exactly (case-insensitive)
3. Add drug aliases to cluster definitions

### Slow response (> 5s)
1. Too many drugs increases pairwise queries: n*(n-1)/2
2. Recommend max 5-7 drugs per request
3. Consider caching common interaction pairs

## Debug Commands

```bash
# Test interactions endpoint
curl -X POST http://localhost:8000/interactions/check \
  -H "Content-Type: application/json" \
  -d '{"drugs": ["warfarin", "aspirin"]}'

# Test pairwise retrieval
python -c "
from backend.app.services.interactions import InteractionsService
svc = InteractionsService()
chunks = svc._retrieve_interaction_chunks(['warfarin', 'aspirin'])
print(f'Retrieved {len(chunks)} chunks')
for c in chunks[:3]:
    print(f'- {c.page_content[:150]}...')
"

# Test risk cluster detection
python -c "
from backend.app.rag.extractors.drug_interactions_extractor import RISK_CLUSTERS
drugs = ['warfarin', 'aspirin', 'clopidogrel']
for cluster, members in RISK_CLUSTERS.items():
    involved = [d for d in drugs if d.lower() in [m.lower() for m in members]]
    if len(involved) > 1:
        print(f'ALERT: {cluster} cluster - {involved}')
"

# Check cleaner for interaction-specific terms
python -c "
from backend.app.rag.cleaners.text_cleaner import INTERACTION_BOOST_TERMS
print('Interaction boost terms:', INTERACTION_BOOST_TERMS)
"
```

## Frontend Features

### Multi-Drug Input
- Uses `InlineSuggestInput` with `multiValue={true}`
- Comma-separated drug names
- Autocomplete from drug catalog

### Severity Color Coding
```tsx
const SEVERITY_COLORS = {
  contraindicated: "#b91c1c",  // Red
  major: "#ea580c",           // Orange
  moderate: "#d97706",        // Yellow
  minor: "#059669",           // Green
  unknown: "#6b7280",         // Gray
};
```

### State Persistence
- Inputs and results saved to localStorage
- Restores on page reload
- "New Search" button clears state

## Performance

| Metric | Target | Typical |
|--------|--------|---------|
| API response time (2 drugs) | < 2s | 1-1.5s |
| API response time (5 drugs) | < 4s | 2.5-3.5s |
| Chunks per pair | 3-5 | 4 |
| LLM tokens | < 5000 | 2500-4000 |

## Monitoring

- Log level: Set `LOG_LEVEL=DEBUG` for pairwise query logging
- Metrics: Track interaction severity distribution
- Alerts: 
  - Response time > 5s
  - Error rate > 5%
  - "contraindicated" interactions should trigger clinical review flag
