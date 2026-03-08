# backend/app/api/topic_generator.py
# Clinova — AI-powered topic content generation via Anthropic API
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("clinova.topic_generator")
router = APIRouter(prefix="/topics", tags=["topics"])

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "topics"
INDEX_PATH = DATA_DIR / "index.json"

# ─── Prompt ───────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a senior clinical physician and medical educator creating content for Clinova, a clinical decision support platform used by doctors at rural PHC/CHC/District Hospital level in India.

Generate complete, medically accurate topic content following the EXACT JSON schema provided. Every field is mandatory. Content must be:
- Evidence-based (cite guideline sources where relevant)
- Practical for rural Indian context (resource-aware, India-specific drug names and availability)
- Pitched at MBBS/MD general practitioner level
- Action-oriented (what to DO, not just what to know)
- Include India-specific epidemiology, common causes in Indian patients, and locally available drugs

CRITICAL OUTPUT RULES — follow exactly:

1. clinicalQuickView.summary: Provide exactly 6-8 items. Each item must be a complete, standalone clinical sentence of 25-40 words covering key facts, epidemiology, diagnosis, or treatment. No bullet fragments.

2. clinicalQuickView.qna: Provide exactly 6-8 Q&A pairs. Questions must be practical bedside questions a doctor would ask (e.g. "When should I suspect...?", "What is the first-line drug at PHC?", "How do I distinguish X from Y?"). Answers must be specific and actionable with doses, thresholds, or criteria where applicable.

3. clinicalFeatures.redFlags: Provide exactly 4-6 red flags. Format each as: "finding → action/diagnosis" (e.g. "Altered consciousness → immediate resuscitation, consider septic encephalopathy"). Each flag must be on one line.

4. keyTakeaway: Provide exactly 4-5 items. Each item must be a bottom-line clinical sentence of 20-35 words summarising the most important management or diagnostic point.

5. treatment.byContext: Must include all 3 facility levels — PHC, CHC, District. Each facility must have a non-empty drugs array with at minimum 2 drugs. Each drug must have: name (include Indian brand name in brackets if common), dose, route, frequency, duration, and notes fields.

6. Drug doses: Always specify name, dose (with units, e.g. mg/kg or mg), route (oral/IV/IM), frequency (OD/BD/TDS/QID/PRN), and duration. Include Indian brand names in brackets where helpful, e.g. "Paracetamol [Crocin] 500mg oral BD".

7. All arrays must be complete — do not truncate or use placeholder ellipses (...) in the output JSON.

The JSON must be valid and complete. Do not truncate any section. Return ONLY valid JSON, no preamble, no explanation, no markdown fences."""

TOPIC_JSON_SCHEMA = """{
  "id": "topic_{slug}_001",
  "slug": "{slug}",
  "title": "{title}",
  "icd10": "...",
  "specialty": ["..."],
  "lastReviewed": "2025-01-01",
  "evidenceLevel": "A|B|C|Expert",
  "clinicalQuickView": {
    "summary": ["6-8 complete clinical sentences, each 25-40 words"],
    "qna": [{"question": "practical bedside question", "answer": "specific actionable answer with doses/criteria"}, "...6-8 pairs total"]
  },
  "definition": {"text": "...", "keyThreshold": "..."},
  "etiology": {
    "categories": [{"category": "...", "causes": ["..."]}],
    "riskFactors": ["..."],
    "commonCauses": ["top 3-5 causes"],
    "rareCauses": ["..."]
  },
  "pathophysiology": {
    "summary": "detailed mechanistic paragraph",
    "keyMechanisms": ["..."],
    "clinicalRelevance": "why this matters at the bedside"
  },
  "clinicalFeatures": {
    "symptoms": [{"feature": "...", "severity": "mild|moderate|severe|all", "note": "optional"}],
    "signs": [{"feature": "...", "severity": "all", "note": "optional"}],
    "redFlags": ["4-6 flags formatted as: finding → action/diagnosis"],
    "severity": [{"level": "mild|moderate|severe", "criteria": "...", "management": "..."}]
  },
  "diagnosticApproach": {
    "stepByStep": [{"step": 1, "action": "...", "rationale": "...", "atPHC": true}],
    "keyInvestigations": [{"name": "...", "purpose": "...", "interpretation": "...", "tier": "PHC|CHC|District|Referral", "cost": "free|low|moderate|high"}],
    "diagnosticAlgorithm": "step-by-step text algorithm",
    "differentialDiagnosis": [{"diagnosis": "...", "distinguishingFeature": "..."}]
  },
  "treatment": {
    "principles": ["..."],
    "byContext": [
      {"facility": "PHC", "approach": "...", "drugs": [{"name": "DrugName [BrandName] dose", "dose": "Xmg", "route": "oral|IV|IM", "frequency": "OD|BD|TDS", "duration": "X days", "notes": "..."}]},
      {"facility": "CHC", "approach": "...", "drugs": [{"name": "...", "dose": "...", "route": "...", "frequency": "...", "duration": "...", "notes": "..."}]},
      {"facility": "District", "approach": "...", "drugs": [{"name": "...", "dose": "...", "route": "...", "frequency": "...", "duration": "...", "notes": "..."}]}
    ],
    "firstLine": [{"drug": "...", "dose": "...", "duration": "...", "evidence": "A|B|C|Expert", "note": "..."}],
    "secondLine": [{"drug": "...", "evidence": "B", "note": "..."}],
    "specialPopulations": [{"population": "Pregnancy|Pediatric|Elderly|Renal|Hepatic", "modification": "...", "caution": "..."}],
    "monitoring": [{"parameter": "...", "frequency": "...", "target": "...", "action": "..."}],
    "whenToRefer": ["..."],
    "pitfalls": ["DO NOT..."]
  },
  "clinicalPearlsAndPitfalls": {
    "pearls": ["..."],
    "pitfalls": ["..."]
  },
  "keyTakeaway": ["4-5 bottom-line sentences, each 20-35 words"]
}"""


# ─── Schema ───────────────────────────────────────────────────────────────────

class TopicGenerateRequest(BaseModel):
    topic: str
    specialty: str = "General Medicine"
    force: bool = False   # overwrite if exists


# ─── Index updater ───────────────────────────────────────────────────────────

def _update_index(slug: str, data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    index: dict = {"topics": []}
    if INDEX_PATH.exists():
        with open(INDEX_PATH, encoding="utf-8") as f:
            index = json.load(f)

    index["topics"] = [t for t in index["topics"] if t.get("slug") != slug]
    index["topics"].append({
        "slug": slug,
        "title": data.get("title", slug.replace("_", " ").title()),
        "icd10": data.get("icd10", ""),
        "specialty": data.get("specialty", []),
        "tags": data.get("tags", []),
    })
    index["topics"].sort(key=lambda t: t["title"])

    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)

    # Invalidate topics router cache
    try:
        from app.api.topics import _load_index
        _load_index.cache_clear()
    except Exception:
        pass


# ─── Route ───────────────────────────────────────────────────────────────────

@router.post("/generate")
async def generate_topic(request: TopicGenerateRequest):
    """
    Generate a complete medical topic content using Claude.
    Saves to data/topics/{slug}.json and updates the index.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY not configured. Add it to backend/.env to use AI topic generation.",
        )

    # Lazy import — anthropic is optional; backend starts fine without it
    try:
        import anthropic as _anthropic
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="anthropic package not installed. Run: pip install anthropic",
        )

    slug = request.topic.lower().strip().replace(" ", "_").replace("/", "_").replace("-", "_")
    filepath = DATA_DIR / f"{slug}.json"

    if filepath.exists() and not request.force:
        raise HTTPException(
            status_code=409,
            detail=f"Topic '{slug}' already exists. Use force=true to regenerate.",
        )

    client = _anthropic.Anthropic(api_key=api_key)

    user_prompt = f"""Generate a complete Clinova topic page for: {request.topic}

Primary specialty: {request.specialty}
Slug: {slug}

Use this EXACT JSON schema:
{TOPIC_JSON_SCHEMA}

Requirements:
- India-specific content: include Indian drug brand names in brackets (e.g. "Paracetamol [Crocin]")
- PHC/CHC/District Hospital context throughout — all 3 facility levels required
- Complete all sections — do not truncate, no ellipsis placeholders
- Exactly 6-8 summary items (25-40 words each)
- Exactly 6-8 Q&A pairs (practical bedside questions, specific actionable answers with doses)
- Exactly 4-6 red flags formatted as: "finding → action/diagnosis"
- At least 6 diagnostic steps
- At least 5 clinical pearls and 5 pitfalls
- Exactly 4-5 key takeaway sentences (20-35 words each)
- Return ONLY valid JSON — no markdown, no preamble"""

    try:
        message = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=8192,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )

        raw_content = message.content[0].text.strip()

        # Strip markdown code fences if present
        if raw_content.startswith("```"):
            lines = raw_content.split("\n")
            raw_content = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

        topic_data = json.loads(raw_content)

        # Ensure slug is correct
        topic_data["slug"] = slug

        # Save to disk
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(topic_data, f, indent=2, ensure_ascii=False)

        # Update index
        _update_index(slug, topic_data)

        logger.info(f"Generated topic: {slug}")
        return {
            "success": True,
            "slug": slug,
            "title": topic_data.get("title"),
            "icd10": topic_data.get("icd10"),
            "url": f"/topics/{slug}",
        }

    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error for generated topic '{slug}': {e}")
        raise HTTPException(
            status_code=422,
            detail=f"AI generated invalid JSON: {str(e)}. Try again or use force=true.",
        )
    except Exception as e:
        # Catches anthropic.APIStatusError and any other runtime error
        logger.error(f"Topic generation failed: {e}")
        detail = getattr(e, "message", str(e))
        status = getattr(e, "status_code", 500)
        raise HTTPException(status_code=status if isinstance(status, int) else 500, detail=detail)
