# Clinova Backend

Evidence-Based Medicine for Every Doctor, Everywhere — FastAPI backend powering Clinova's clinical decision support engine.

## Quick Start

```bash
python3 -m uvicorn app.main:app --reload --reload-dir app --port 9000
```

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for LLM synthesis |
| `CLINOVA_API_KEYS` | Comma-separated API keys for external integrations |
| `CLINOVA_SERVICE_NAME` | Service identifier (default: `clinova-api`) |
| `CLINOVA_VERSION` | Version string (default: `v2.0.0`) |
| `CLINOVA_ENV` | Environment: `local` / `staging` / `production` |
| `INTEGRATION_ALLOWED_ORIGINS` | Comma-separated extra CORS origins |

## API Reference

Base URL: `http://127.0.0.1:9000`
All endpoints are prefixed with `/api`.
External integrations require the `X-Clinova-Key` header.

---

### Health

```bash
curl -sS http://127.0.0.1:9000/health
curl -sS http://127.0.0.1:9000/api/health
curl -sS http://127.0.0.1:9000/version
```

### Search Suggest

```bash
curl -sS "http://127.0.0.1:9000/api/search/suggest?q=fever"
```

### Topic

```bash
curl -sS "http://127.0.0.1:9000/api/topic/fever?debug=true"
```

### Differential Diagnosis

```bash
curl -sS -X POST http://127.0.0.1:9000/api/ddx/run \
  -H "Content-Type: application/json" \
  -d '{"symptoms":"fever with diabetes","age":50,"sex":"male","comorbidities":["DM","CKD"],"meds":["ACE inhibitor"]}'
```

### Treatment Advisor

```bash
curl -sS -X POST http://127.0.0.1:9000/api/treatment/advice \
  -H "Content-Type: application/json" \
  -d '{"condition":"community acquired pneumonia","age":50,"sex":"male","comorbidities":["DM"]}'
```

### Drug Database

```bash
curl -sS "http://127.0.0.1:9000/api/drugs/search?q=glyco"
curl -sS "http://127.0.0.1:9000/api/drugs/Glycomet?debug=true"
```

### Drug Interactions

```bash
curl -sS -X POST http://127.0.0.1:9000/api/interactions/check \
  -H "Content-Type: application/json" \
  -d '{"drugs":["ace inhibitor","spironolactone","potassium chloride"]}'
```

### Prescription Studio

```bash
curl -sS -X POST http://127.0.0.1:9000/api/rxstudio/draft \
  -H "Content-Type: application/json" \
  -d '{"transcript":"Patient with fever since 3 days, known diabetes, on metformin.","patient":{"age":50,"sex":"male"}}'
```

### External Integration (API-key protected)

```bash
curl -sS http://127.0.0.1:9000/api/integrations/health \
  -H "X-Clinova-Key: your_api_key_here"
```
