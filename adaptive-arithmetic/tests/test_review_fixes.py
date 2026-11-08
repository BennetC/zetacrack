"""Permanent regressions for the 14 October review, synthetic databases only."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import csv
import io
import json
import sqlite3
from threading import Barrier, Event

import pytest
from fastapi.testclient import TestClient

from server.app import create_app, ticks
from server.analytics import standard_config
from server.decimal_input import DECIMAL_WHITESPACE, exact
from tests.test_api import configuration
from tests.test_measurements import START, events


def standard_body():
    return {"config": standard_config(), "seed": "review-fix", "generatorVersion": "zetamac-reverse-v1", "policyVersion": "equal-operations-v1", "measurementVersion": "response-timing-v1", "mode": "standard", "contentVersion": "zetamac-default-v1"}


def question(identity="q0", index=0):
    return {"id": identity, "index": index, "operation": "addition", "groupId": "standard-addition", "left": "2", "right": "100", "expected": "102", "selection": {"operationBasisPoints": 2500, "groupBasisPoints": 10000, "validPairCount": "9801"}}


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "review-fixes.sqlite3"), raise_server_exceptions=False) as client:
        yield client


def create(client):
    response = client.post("/api/sessions", json=standard_body())
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_200_concurrent_identical_batches_are_all_idempotent(client):
    raw = events([START, ("session-ended", 0, {"reason": "manual-end", "endTimeKnown": True})])
    statuses = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        for _ in range(25):
            identity = create(client)
            barrier = Barrier(8)
            def append(_):
                barrier.wait(10)
                return client.post(f"/api/sessions/{identity}/observations", json={"events": raw}).status_code
            statuses.extend(pool.map(append, range(8)))
            assert client.get(f"/api/sessions/{identity}").json()["events"] == raw
    assert statuses == [200] * 200


@pytest.mark.parametrize("variant", ["identical", "conflict", "longer-tail", "shorter-after-tail"])
def test_competing_write_transactions_compare_atomically(tmp_path, monkeypatch, variant):
    """Pause the first writer inside its transaction; the rival must wait."""
    import server.app as module
    with TestClient(create_app(tmp_path / "controlled.sqlite3"), raise_server_exceptions=False) as client:
        identity = create(client)
        original = sqlite3.connect
        first_checked, second_started, release = Event(), Event(), Event()
        class ControlledConnection(sqlite3.Connection):
            def execute(self, sql, *args, **kwargs):
                if sql == "BEGIN IMMEDIATE" and first_checked.is_set():
                    second_started.set()
                cursor = super().execute(sql, *args, **kwargs)
                if sql.startswith("SELECT event FROM observations") and not first_checked.is_set():
                    first_checked.set()
                    assert release.wait(10)
                return cursor
        monkeypatch.setattr(module.sqlite3, "connect", lambda *a, **kw: original(*a, **kw, factory=ControlledConnection))
        short = events([START])
        other = deepcopy(short)
        if variant == "conflict": other[0]["payload"]["different"] = True
        if variant == "longer-tail": other += events([START, ("session-ended", 0, {"reason": "manual-end", "endTimeKnown": True})])[1:]
        if variant == "shorter-after-tail": short += events([START, ("session-ended", 0, {"reason": "manual-end", "endTimeKnown": True})])[1:]
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(client.post, f"/api/sessions/{identity}/observations", json={"events": short})
            assert first_checked.wait(10)
            second = pool.submit(client.post, f"/api/sessions/{identity}/observations", json={"events": other})
            try:
                assert second_started.wait(10)
                assert not second.done()
            finally:
                release.set()
            assert first.result(10).status_code == 200
            assert second.result(10).status_code == (409 if variant == "conflict" else 200)
        assert client.get(f"/api/sessions/{identity}").json()["events"] == (other if variant == "longer-tail" else short)


def test_conflicting_batch_rolls_back_its_new_tail_and_status(client):
    identity = create(client)
    stored = events([START])
    assert client.post(f"/api/sessions/{identity}/observations", json={"events": stored}).status_code == 200
    # Deliberately out of list order: insertion/status update must roll back
    # when a later item in this same batch conflicts with the immutable prefix.
    new = {"sequence": 1, "type": "session-ended", "elapsedMs": 0, "payload": {"endTimeKnown": True}}
    conflicting = deepcopy(stored[0]); conflicting["payload"] = {"conflict": True}
    assert client.post(f"/api/sessions/{identity}/observations", json={"events": [new, conflicting]}).status_code == 409
    saved = client.get(f"/api/sessions/{identity}").json()
    assert saved["status"] == "open" and saved["events"] == stored


def test_explicit_decimal_whitespace_is_identical_across_config_provenance_metrics_and_exports(client):
    # Every ECMAScript boundary character is accepted, with original raw bytes.
    for whitespace in DECIMAL_WHITESPACE:
        assert exact(whitespace + "-1.2500" + whitespace) == exact("-1.25")
        assert ticks(whitespace + "-1.2500" + whitespace, 2) == -125
    config = configuration()
    group = config["operations"][0]["groups"][0]
    config["operations"][0]["share"] = "\ufeff100\ufeff"
    group["share"] = "\u2007100\u2029"
    group["first"]["min"] = "\ufeff10\ufeff"
    body = {"config": config, "seed": "whitespace", "mode": "custom", "contentVersion": "custom-grid-v1", "measurementVersion": "response-timing-v1", "generatorVersion": "exact-grid-v1", "policyVersion": "hierarchical-shares-v1"}
    identity = client.post("/api/sessions", json=body).json()["id"]
    q = question(); q.update(groupId="g1", left="\ufeff10", right="11\u2028", expected="21", selection={"operationBasisPoints": 10000, "groupBasisPoints": 10000, "validPairCount": "8100"})
    raw_input = "\ufeff\u202f+21.000\u3000"
    raw = events([START, ("question-presented", 0, {"question": q}), ("input-changed", 5, {"questionId": "q0", "value": raw_input, "inputType": "insertFromPaste"}), ("answer-accepted", 10, {"questionId": "q0", "value": raw_input}), ("session-ended", 120000, {"reason": "timeout", "endTimeKnown": True})])
    assert client.post(f"/api/sessions/{identity}/observations", json={"events": raw}).status_code == 200
    saved = client.get(f"/api/sessions/{identity}").json()
    assert saved["config"] == config and saved["events"] == raw and saved["comparisonEligible"]
    assert saved["summary"]["validCorrectAnswerCount"] == 1 and saved["questions"][0]["firstInputTimeMs"] == 5
    assert client.get(f"/api/sessions/{identity}/export?format=json").json()["sessions"] == [saved]
    row = next(csv.DictReader(io.StringIO(client.get(f"/api/sessions/{identity}/export?format=csv").text)))
    assert json.loads(row["acceptedInputJson"]) == raw_input and row["correctAnswerTimeMs"] == "10.0"


@pytest.mark.parametrize("unsupported", ["\u0085", "\u001c", "\u001d", "\u001e", "\u001f", "\u180e", "\u200b", "\u2060", "\u0661", "\uff11"])
def test_non_ecmascript_boundaries_and_non_ascii_digits_are_rejected(unsupported):
    with pytest.raises(ValueError): exact(unsupported + "21" + unsupported)
    with pytest.raises(ValueError): ticks(unsupported + "21" + unsupported, 0)


@pytest.mark.parametrize("case", ["valid", "invalid-value", "missing-value", "null-value", "invalid-index", "unknown-reference", "missing-reference", "stale-reference", "gap-after-complete", "clock-after-complete", "gap-during-current", "malformed-acceptance"])
def test_damaged_intervals_are_null_without_tainting_independently_completed_questions(client, case):
    q0, q1, q2 = question(), question("q1", 1), question("q2", 2)
    raw = [START, ("question-presented", 0, {"question": q0})]
    if case in ("invalid-value", "missing-value", "null-value"):
        payload = {"questionId": "q0"}
        if case != "missing-value": payload["value"] = False if case == "invalid-value" else None
        raw.append(("input-changed", 5, payload))
    if case == "invalid-index": q0["index"] = False
    raw.extend([("input-changed", 10, {"questionId": "q0", "value": "102"}), ("answer-accepted", 10, {"questionId": "q0", "value": "102"})])
    if case == "malformed-acceptance": raw[-1][2]["value"] = False
    raw.append(("question-presented", 20, {"question": q1}))
    if case in ("unknown-reference", "missing-reference", "stale-reference"):
        payload = {"value": "x"}
        if case != "missing-reference": payload["questionId"] = "missing" if case == "unknown-reference" else "q0"
        raw.append(("input-changed", 25, payload))
    raw.extend([("input-changed", 30, {"questionId": "q1", "value": "102"}), ("answer-accepted", 30, {"questionId": "q1", "value": "102"}), ("question-presented", 40, {"question": q2}), ("answer-accepted", 50, {"questionId": "q2", "value": "102"}), ("session-ended", 120000, {"reason": "timeout", "endTimeKnown": True})])
    record = events(raw)
    q1_event = next(i for i, e in enumerate(record) if e["type"] == "question-presented" and e["payload"]["question"]["id"] == "q1")
    if case in ("gap-after-complete", "gap-during-current"):
        for e in record[q1_event + (case == "gap-during-current"):]: e["sequence"] += 1
    if case == "clock-after-complete": record[q1_event]["elapsedMs"] = 9
    identity = create(client)
    assert client.post(f"/api/sessions/{identity}/observations", json={"events": record}).status_code == 200
    saved = client.get(f"/api/sessions/{identity}").json()
    local_damage = case in ("invalid-value", "missing-value", "null-value", "invalid-index", "malformed-acceptance")
    expected = [None, 10, 10] if local_damage else [10, 10, 10] if case == "valid" else [10, None, None]
    assert [q["correctAnswerTimeMs"] for q in saved["questions"]] == expected
    assert saved["summary"]["validCorrectAnswerCount"] == sum(v is not None for v in expected)
    if local_damage: assert saved["questions"][0]["firstInputTimeMs"] is None
    assert saved["events"] == record
    if case != "valid": assert saved["dataQualityWarnings"] and not saved["comparisonEligible"]
    assert client.get(f"/api/sessions/{identity}/export?format=json").json()["sessions"] == [saved]
    rows = list(csv.DictReader(io.StringIO(client.get(f"/api/sessions/{identity}/export?format=csv").text)))
    assert [float(row["correctAnswerTimeMs"]) if row["correctAnswerTimeMs"] else None for row in rows] == expected
    included = client.get("/api/analytics", params={"includePartial": "true", "cohort": saved["cohortKey"]}).json()
    assert included["summary"] == saved["summary"] == saved["analysis"]["summary"]
    assert sum(b["count"] for b in included["histogram"]) == sum(v is not None for v in expected)
    assert all(group["validCorrectAnswerCount"] == sum(v is not None for v in expected) for group in included["breakdown"])


def test_legacy_missing_acceptance_remains_usable_but_malformed_field_change_does_not(client):
    body = standard_body()
    for key in ("mode", "contentVersion", "measurementVersion"): body.pop(key)
    body.update(generatorVersion="exact-grid-v1", policyVersion="hierarchical-shares-v1")
    for malformed in (False, True):
        identity = client.post("/api/sessions", json=body).json()["id"]
        raw = [START, ("question-presented", 0, {"question": question()})]
        if malformed: raw.append(("input-changed", 5, {"questionId": "q0", "value": False}))
        raw.extend([("answer-accepted", 10, {"questionId": "q0"}), ("session-ended", 20, {"endTimeKnown": True})])
        client.post(f"/api/sessions/{identity}/observations", json={"events": events(raw)})
        saved = client.get(f"/api/sessions/{identity}").json()
        assert saved["summary"]["validCorrectAnswerCount"] == (0 if malformed else 1)
