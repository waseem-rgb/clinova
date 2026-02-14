# MedCompanion Backend

## Quick Start

```bash
python3 -m uvicorn app.main:app --reload --reload-dir app --port 9000
```

## Curl Examples

### Health
```bash
curl -sS http://127.0.0.1:9000/health
```

### Search Suggest
```bash
curl -sS "http://127.0.0.1:9000/search/suggest?q=fever"
```

### Topic
```bash
curl -sS "http://127.0.0.1:9000/topic/fever?debug=true"
```

### DDx
```bash
curl -sS -X POST http://127.0.0.1:9000/ddx/run \
  -H "Content-Type: application/json" \
  -d '{"symptoms":"fever with diabetes","age":50,"sex":"male","comorbidities":["DM","CKD"],"meds":["ACE inhibitor"]}'
```

### Treatment Advisor
```bash
curl -sS -X POST http://127.0.0.1:9000/treatment/advice \
  -H "Content-Type: application/json" \
  -d '{"condition":"community acquired pneumonia","age":50,"sex":"male","pregnancy":"unknown","comorbidities":["DM","CKD"],"meds":["ACE inhibitor"]}'
```

### Drugs
```bash
curl -sS "http://127.0.0.1:9000/drugs/search?q=glyco"
curl -sS "http://127.0.0.1:9000/drugs/Glycomet?debug=true"
```

### Interactions
```bash
curl -sS -X POST http://127.0.0.1:9000/interactions/check \
  -H "Content-Type: application/json" \
  -d '{"drugs":["ace inhibitor","spironolactone","potassium chloride"]}'
```

### Rx Studio
```bash
curl -sS -X POST http://127.0.0.1:9000/rxstudio/draft \
  -H "Content-Type: application/json" \
  -d '{"transcript":"Patient with fever since 3 days, known diabetes, on metformin.","patient":{"age":50,"sex":"male","pregnancy":"unknown","comorbidities":["DM"]}}'
```
