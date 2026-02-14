from __future__ import annotations

import json

from app.services.treatment import get_treatment_advice


def main() -> None:
    payload = {
        "topic_or_diagnosis": "community acquired pneumonia",
        "context": {"age": 50, "sex": "male", "setting": "OPD", "severity": "moderate"},
        "confirmed_diagnosis": True,
        "source": "direct",
    }
    res = get_treatment_advice(payload, debug=True)
    print(json.dumps({
        "endpoint": "/api/treatment/plan",
        "queries": res.get("debug", {}).get("queries"),
        "filters": res.get("debug", {}).get("filters"),
        "retrieval": res.get("debug", {}).get("retrieval"),
        "response_keys": list(res.keys()),
    }, indent=2))


if __name__ == "__main__":
    main()
