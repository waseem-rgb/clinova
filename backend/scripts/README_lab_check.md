# Lab Parser Smoke Check

Run the smoke check:

```bash
python3 backend/scripts/lab_smoke_check.py /Users/waseemafsar/Downloads/lab_report.pdf
```

API check:

```bash
curl -sS -X POST "http://127.0.0.1:9000/api/lab/analyze?debug=true" \
  -F "files=@/Users/waseemafsar/Downloads/lab_report.pdf" \
  -F "age=50" -F "sex=male" -F "pregnancy=unknown" \
  -F "known_dx=DM, CKD" -F "current_meds=ACE inhibitor" \
  -F "chief_complaint=fever" > /tmp/lab_response.json
```

Checks:

```bash
jq '.debug.counts' /tmp/lab_response.json
jq -r '.abnormalities[].test' /tmp/lab_response.json | rg -n "(from 7-|sunlight|ergocalciferol|cause|levels|method|reference|comment|remark)" || true
jq -r '.extracted_tests[] | select(.test | test("LDL"; "i")) | {test, value_raw, ref_low, ref_high, ref_range_raw}' /tmp/lab_response.json
```
