"""Repeat all six original C03 cases with repaired expectations and raw traces."""
import csv
import io
import json
import os
from pathlib import Path
import sys
from time import time_ns
from copy import deepcopy

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root))
scratch = root / "data" / "fix-2026-10-15-probes"
scratch.mkdir(parents=True, exist_ok=True)
stamp = time_ns()
os.environ["ARITHMETIC_DB"] = str(scratch / f"import-{stamp}.sqlite3")
from fastapi.testclient import TestClient
from server.app import create_app
from tests.test_review_fixes import standard_body, question
from tests.test_measurements import START, events

results = {}
expected_counts = {"valid": 1, "unknown-reference": 0, "invalid-value": 0, "invalid-index": 0, "correct-after-stale-reference": 1, "gap-after-correct": 1}
cumulative = 0
with TestClient(create_app(scratch / f"timing-{stamp}.sqlite3")) as client:
    for case, expected_count in expected_counts.items():
        raw = [START, ("question-presented", 0, {"question": question()})]
        if case == "unknown-reference": raw.append(("input-changed", 5, {"questionId": "missing", "value": "x"}))
        if case == "invalid-value": raw.append(("input-changed", 5, {"questionId": "q0", "value": False}))
        if case == "invalid-index": raw[1][2]["question"]["index"] = False
        raw.extend([("input-changed", 10, {"questionId": "q0", "value": "102"}), ("answer-accepted", 10, {"questionId": "q0", "value": "102"})])
        if case in ("correct-after-stale-reference", "gap-after-correct"):
            raw.append(("question-presented", 20, {"question": question("q1", 1)}))
            if case == "correct-after-stale-reference": raw.extend([("input-changed", 30, {"questionId": "q0", "value": "x"}), ("input-changed", 40, {"questionId": "q1", "value": "102"}), ("answer-accepted", 40, {"questionId": "q1", "value": "102"})])
        raw.append(("session-ended", 120000, {"reason": "timeout", "endTimeKnown": True, "wallAt": "2026-10-15T12:02:00Z"}))
        record = events(raw)
        if case == "gap-after-correct":
            for e in record[4:]: e["sequence"] += 1
        original = deepcopy(record)
        identity = client.post("/api/sessions", json=standard_body()).json()["id"]
        assert client.post(f"/api/sessions/{identity}/observations", json={"events": record}).status_code == 200
        saved = client.get(f"/api/sessions/{identity}").json()
        exported = client.get(f"/api/sessions/{identity}/export?format=json").json()["sessions"][0]
        assert saved == exported and saved["events"] == original
        assert saved["summary"]["validCorrectAnswerCount"] == expected_count
        assert saved["analysis"]["summary"] == saved["summary"]
        if case in ("correct-after-stale-reference", "gap-after-correct"):
            assert saved["questions"][0]["correctAnswerTimeMs"] == 10
            assert saved["questions"][1]["correctAnswerTimeMs"] is None
        if case == "invalid-value":
            assert saved["questions"][0]["firstInputTimeMs"] is None
            assert saved["questions"][0]["firstInputElapsedMs"] is None
        rows = list(csv.DictReader(io.StringIO(client.get(f"/api/sessions/{identity}/export?format=csv").text)))
        assert sum(row["correctAnswerTimeMs"] != "" for row in rows) == expected_count
        cumulative += expected_count
        included = client.get("/api/analytics", params={"includePartial": "true", "cohort": saved["cohortKey"]}).json()
        assert included["summary"]["validCorrectAnswerCount"] == cumulative
        assert sum(bin["count"] for bin in included["histogram"]) == cumulative
        results[case] = {"saved": saved, "cumulativePartialValidTimes": cumulative, "readExportCsvGraphAgreement": True}
out = Path(__file__).with_name("timing-probes.json")
out.write_text(json.dumps({"synthetic": True, "cases": results}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"cases": len(results), "expectedValidCorrectCounts": expected_counts, "cumulativePartialValidTimes": cumulative, "readExportCsvGraphAgreement": True}))
