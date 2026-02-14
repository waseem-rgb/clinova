from __future__ import annotations

import json
import urllib.error
import urllib.request


def post_json(url: str, payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def run_case(label: str, payload: dict) -> None:
    url = "http://127.0.0.1:9000/api/treatment/plan?debug=true"
    try:
        res = post_json(url, payload)
    except urllib.error.HTTPError as exc:
        print(f"[{label}] HTTP error: {exc.code} {exc.read().decode('utf-8')}")
        return

    coverage = res.get("evidence", {}).get("coverage", {})
    first_line = res.get("first_line_regimens", [])
    topic = res.get("topic")
    print(f"\n[{label}] topic={topic} coverage={coverage}")
    if first_line:
        drugs = first_line[0].get("drugs", [])
        print(f"first_line_drugs={len(drugs)}")
        for r in drugs[:3]:
            print(f"- {r.get('generic')} {r.get('dose')} {r.get('route')} {r.get('frequency')} {r.get('duration')}")


def main() -> None:
    cases = [
        (
            "acute_asthma",
            {
                "topic_or_diagnosis": "acute asthma exacerbation",
                "context": {"age": 45, "sex": "male", "setting": "ER", "severity": "severe"},
                "confirmed_diagnosis": True,
                "source": "direct",
            },
        ),
        (
            "cap_opd",
            {
                "topic_or_diagnosis": "community acquired pneumonia",
                "context": {"age": 50, "sex": "male", "setting": "OPD"},
                "confirmed_diagnosis": True,
                "source": "direct",
            },
        ),
        (
            "hfrEF",
            {
                "topic_or_diagnosis": "HFrEF",
                "context": {"age": 62, "sex": "male", "setting": "OPD"},
                "confirmed_diagnosis": True,
                "source": "direct",
            },
        ),
    ]

    for label, payload in cases:
        run_case(label, payload)


if __name__ == "__main__":
    main()
