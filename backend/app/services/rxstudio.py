from __future__ import annotations

import re
from typing import Any, Dict, List

from app.services.interactions import check_interactions


def _extract_list(pattern: str, text: str) -> List[str]:
    out = []
    for m in re.finditer(pattern, text, re.IGNORECASE):
        val = m.group(1).strip()
        if val:
            out.append(val)
    return out


def _parse_transcript(transcript: str) -> Dict[str, Any]:
    t = transcript or ""
    symptoms = _extract_list(r"(?:complains of|with|having)\s+([^\.]+)", t)
    duration = _extract_list(r"(?:since|for)\s+(\d+\s*(?:days?|weeks?|months?))", t)
    meds = _extract_list(r"(?:on|taking)\s+([A-Za-z0-9\- ]+)", t)
    diagnosis = _extract_list(r"(?:diagnosis|diagnosed with)\s+([^\.]+)", t)
    return {
        "symptoms": symptoms,
        "duration": duration[0] if duration else None,
        "meds": meds,
        "diagnosis": diagnosis,
    }


def build_rx_draft(payload: Dict[str, Any]) -> Dict[str, Any]:
    transcript = payload.get("transcript") or ""
    patient = payload.get("patient") or {}
    intent = payload.get("intent") or "both"

    parsed = _parse_transcript(transcript)
    meds = parsed.get("meds") or []

    soap = {
        "S": " ".join(parsed.get("symptoms") or []) or "No symptoms extracted from transcript.",
        "O": "Vitals/labs not provided in transcript.",
        "A": ", ".join(parsed.get("diagnosis") or []) or "Assessment pending.",
        "P": "Plan based on clinician review and evidence.",
    }

    rx_items = []
    for m in meds:
        rx_items.append({"drug": m, "dose": "Not specified", "route": "Not specified", "frequency": "Not specified"})

    if not rx_items:
        rx_items.append({"drug": "No drug specified", "dose": "N/A", "route": "N/A", "frequency": "N/A"})

    interactions = check_interactions({"drugs": meds}) if meds else {"interactions": []}

    warnings = []
    for inter in interactions.get("interactions", []):
        warnings.append(
            {
                "type": "interaction",
                "severity": inter.get("severity"),
                "message": inter.get("mechanism"),
                "related_drugs": inter.get("pair"),
            }
        )

    if patient.get("pregnancy") in {"yes", "unknown"}:
        warnings.append(
            {
                "type": "pregnancy",
                "severity": "caution",
                "message": "Pregnancy status requires medication review.",
            }
        )

    response = {
        "transcript": transcript,
        "soap": soap if intent in {"soap", "both"} else None,
        "prescription": {
            "items": rx_items,
            "instructions": ["Follow clinician guidance."],
            "followup": ["Reassess if symptoms worsen."],
        }
        if intent in {"prescription", "both"}
        else None,
        "warnings": warnings,
        "audit_trail": {
            "rules_fired": ["transcript_parser", "interaction_checker"],
            "evidence_chunks": [],
        },
        "disclaimer_text": "This draft is for clinician review and must be verified before use.",
    }

    return response
