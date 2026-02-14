from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request


def post_json(url: str, payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def run_case(label: str, payload: dict) -> None:
    url = "http://127.0.0.1:9000/ddx/run?debug=true"
    try:
        res = post_json(url, payload)
    except urllib.error.HTTPError as exc:
        print(f"[{label}] HTTP error: {exc.code} {exc.read().decode('utf-8')}")
        return

    coverage = res.get("coverage_gate", {})
    debug = res.get("debug", {})
    kept = debug.get("retrieval", {}).get("kept_count")
    dropped = debug.get("retrieval", {}).get("dropped_count")
    print(f"\n[{label}] kept={kept} dropped={dropped} coverage={coverage}")
    print(f"queries={debug.get('queries')}")

    must_not_miss = [m.get("diagnosis") for m in res.get("must_not_miss", [])]
    ranked = [d.get("diagnosis") for d in res.get("ranked_ddx", [])]
    print(f"must_not_miss={must_not_miss}")
    print(f"ranked_ddx={ranked[:6]}")

    evidence_ids = {e.get("id") for e in res.get("evidence", []) if e.get("id")}
    referenced_ids = set()
    for m in res.get("must_not_miss", []):
        referenced_ids.update(m.get("evidence_ids") or [])
    for r in res.get("ranked_ddx", []):
        referenced_ids.update(r.get("evidence_ids") or [])
    missing = referenced_ids - evidence_ids
    print(f"evidence_ids_missing={sorted(missing)}")


if __name__ == "__main__":
    cases = [
        (
            "fever_sob",
            {
                "symptoms": "fever, shortness of breath",
                "duration": "3 days",
                "age": 50,
                "sex": "male",
                "pregnancy": "no",
                "comorbidities": ["Nonalcoholic fatty liver disease"],
                "meds": ["ACE inhibitor"],
            },
        ),
        (
            "chest_pain_sob_leg",
            {
                "symptoms": "chest pain, shortness of breath, swelling in leg",
                "duration": "5 days",
                "age": 54,
                "sex": "male",
                "pregnancy": "no",
                "comorbidities": ["NAFLD"],
                "meds": [],
            },
        ),
    ]

    for label, payload in cases:
        run_case(label, payload)
