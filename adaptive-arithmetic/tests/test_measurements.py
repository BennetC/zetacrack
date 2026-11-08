"""Synthetic timing/export fixtures, never user performance observations."""
from copy import deepcopy
import csv
import io
import json
import sqlite3
from threading import Event, Thread

from fastapi.testclient import TestClient
import pytest

from server.app import create_app
from server.measurements import CSV_FIELDS, derive_session
from tests.test_api import configuration


def question(identity="q0", **extra):
    return {"id": identity, "index": 0, "operation": "addition", "groupId": "g1", "left": "10", "right": "11", "expected": "21", "selection": {"operationBasisPoints": 10000, "groupBasisPoints": 10000, "validPairCount": "8100"}, **extra}


def events(items):
    return [{"sequence": i, "type": kind, "elapsedMs": at, "payload": payload} for i, (kind, at, payload) in enumerate(items)]


def session(items):
    return {"id": "synthetic", "config": configuration(), "seed": "replay", "generatorVersion": "exact-grid-v1", "policyVersion": "hierarchical-shares-v1", "measurementVersion": "response-timing-v1", "createdAt": "2026-10-09T12:00:00Z", "status": "ended", "events": events(items)}


START = ("session-started", 0, {"wallAt": "2026-10-09T12:00:00Z"})


def end(at, known=True):
    return ("session-ended", at, {"reason": "manual-end" if known else "interrupted-reload", "endTimeKnown": known, "wallAt": "2026-10-09T12:05:00Z"})


def test_first_change_edits_paste_and_acceptance_are_different_unrounded_intervals():
    raw = session([START, ("question-presented", 10.125, {"question": question()}),
                   ("input-changed", 11.375, {"questionId": "q0", "value": "x", "inputType": "insertText"}),
                   ("input-changed", 12.625, {"questionId": "q0", "value": "", "inputType": "deleteContentBackward"}),
                   ("input-changed", 40.987654321, {"questionId": "q0", "value": " 21\n", "inputType": "insertFromPaste"}),
                   ("answer-accepted", 40.987654321, {"questionId": "q0", "value": " 21\n"}), end(50)])
    untouched = deepcopy(raw)
    derived = derive_session(raw)
    q = derived["questions"][0]
    assert raw == untouched
    assert q["firstInputTimeMs"] == 1.25
    assert q["correctAnswerTimeMs"] == 40.987654321 - 10.125
    assert q["acceptedInput"] == q["lastInput"] == " 21\n"
    assert q["inputChangeCount"] == 3
    assert not derived["dataQualityWarnings"]


@pytest.mark.parametrize("values,expected_median,expected_mean", [([], None, None), ([0], 0, 0), ([1, 3, 8], 3, 4), ([1, 3, 7, 9], 5, 5)])
def test_empty_zero_odd_and_even_summaries(values, expected_median, expected_mean):
    items = [START]
    at = 0
    for index, value in enumerate(values):
        q = question(str(index))
        items.append(("question-presented", at, {"question": q}))
        at += value
        items.append(("answer-accepted", at, {"questionId": q["id"], "value": "21"}))
    summary = derive_session(session([*items, end(at)]))["summary"]
    assert summary["medianCorrectAnswerTimeMs"] == expected_median
    assert summary["meanCorrectAnswerTimeMs"] == expected_mean
    assert summary["validCorrectAnswerCount"] == len(values)


@pytest.mark.parametrize("known", [True, False])
def test_unfinished_last_input_and_unknown_recovery_lower_bound(known):
    result = derive_session(session([START, ("question-presented", 1.5, {"question": question()}), ("input-changed", 20.75, {"questionId": "q0", "value": ""}), end(20.75, known)]))
    q = result["questions"][0]
    assert q["outcome"] == "unfinished" and q["correctAnswerTimeMs"] is None
    assert q["firstInputTimeMs"] == q["observedUnfinishedDurationMs"] == 19.25
    assert q["lastInput"] == "" and q["acceptedInput"] is None
    assert q["unfinishedDurationIsLowerBound"] is (not known)
    assert result["endedAt"] == ("2026-10-09T12:05:00Z" if known else None)
    assert result["terminationState"] == ("ended" if known else "incomplete")


@pytest.mark.parametrize("damage", ["decreasing", "gap", "duplicate", "after-end", "missing-start", "bad-reference"])
def test_invalid_order_retains_raw_and_omits_invalid_correct_times(damage):
    raw = session([START, ("question-presented", 10, {"question": question()}), ("input-changed", 15, {"questionId": "q0", "value": "21"}), ("answer-accepted", 15, {"questionId": "q0", "value": "21"}), end(20)])
    if damage == "decreasing": raw["events"][2]["elapsedMs"] = 9
    if damage == "gap": raw["events"][2]["sequence"] = 9
    if damage == "duplicate": raw["events"][2].update(type="question-presented", payload={"question": question()})
    if damage == "after-end": raw["events"][2].update(type="session-ended", payload={"endTimeKnown": True})
    if damage == "missing-start": raw["events"][0].update(type="input-changed", payload={})
    if damage == "bad-reference": raw["events"][3]["payload"]["questionId"] = "missing"
    derived = derive_session(raw)
    assert derived["events"] == raw["events"]
    assert derived["dataQualityWarnings"]
    assert derived["summary"]["validCorrectAnswerCount"] == 0
    assert all(q["correctAnswerTimeMs"] is None for q in derived["questions"])


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "exports.sqlite3")) as client:
        yield client


def create(client, config=None, measurement=True):
    body = {"config": config or configuration(), "seed": "export-seed", "generatorVersion": "exact-grid-v1", "policyVersion": "hierarchical-shares-v1"}
    if measurement: body["measurementVersion"] = "response-timing-v1"
    return client.post("/api/sessions", json=body).json()["id"]


def test_exports_agree_with_results_and_preserve_snapshot_exact_decimals_and_input_encoding(client):
    config = configuration()
    g = config["operations"][0]["groups"][0]
    g["name"] = '測定, "Größe"\nnew line'
    g["first"] = {"min": "-99.001", "max": "-10.001", "decimalPlaces": 3}
    g["second"] = {"min": "0.001", "max": "0.001", "decimalPlaces": 3}
    preset = client.post("/api/presets", json={"name": "Exact", "config": config}).json()["id"]
    identity = create(client, config)
    inputs = '  "Δ,測定"\n-10.000 '
    raw = events([START, ("question-presented", 0.012345, {"question": question(left="-10.001", right="0.001", expected="-10.000")}), ("input-changed", 100.23456789, {"questionId": "q0", "value": inputs, "inputType": "insertFromPaste"}), ("answer-accepted", 101.987654321, {"questionId": "q0", "value": inputs}), ("question-presented", 102, {"question": question("q1")}), ("input-changed", 103, {"questionId": "q1", "value": ""}), end(104)])
    assert client.post(f"/api/sessions/{identity}/observations", json={"events": raw}).is_success
    updated = deepcopy(config); updated["session"]["durationSeconds"] = "30"
    client.put(f"/api/presets/{preset}", json={"name": "Changed", "config": updated})
    client.delete(f"/api/presets/{preset}")
    result = client.get(f"/api/sessions/{identity}").json()
    export = client.get(f"/api/sessions/{identity}/export?format=json")
    envelope = export.json()
    assert envelope["exportVersion"] == 1 and envelope["exportedAt"] and envelope["timingDefinitions"]
    assert envelope["sessions"] == [result]
    assert result["config"] == config and result["events"] == raw
    assert result["measurementVersion"] == "response-timing-v1"
    response = client.get(f"/api/sessions/{identity}/export?format=csv")
    assert "charset=utf-8" in response.headers["content-type"]
    assert "attachment;" in response.headers["content-disposition"]
    assert g["name"] in response.content.decode("utf-8").replace('""', '"')
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert len(rows) == 2 and list(rows[0]) == CSV_FIELDS
    assert rows[0]["left"] == "-10.001" and rows[0]["expected"] == "-10.000"
    assert json.loads(rows[0]["configJson"]) == config
    assert json.loads(rows[0]["acceptedInputJson"]) == json.loads(rows[0]["lastInputJson"]) == inputs
    assert rows[1]["acceptedInputJson"] == "" and json.loads(rows[1]["lastInputJson"]) == ""
    # Arbitrary raw accepted strings are retained, but cannot certify a correct
    # response-time observation. Export and results both keep it null.
    assert rows[0]["correctAnswerTimeMs"] == "" and result["questions"][0]["correctAnswerTimeMs"] is None
    assert client.get("/api/exports/sessions?format=json").json()["sessions"] == [result]
    assert client.get("/api/exports/sessions?format=csv").text == response.text


def test_empty_history_no_question_sessions_legacy_and_read_only_active_exports(client):
    assert client.get("/api/exports/sessions?format=json").json()["sessions"] == []
    assert list(csv.reader(io.StringIO(client.get("/api/exports/sessions?format=csv").text))) == [CSV_FIELDS]
    empty = create(client, measurement=False)
    active = create(client)
    raw = events([START, ("question-presented", 10, {"question": question()}), ("input-changed", 11, {"questionId": "q0", "value": "9"})])
    client.post(f"/api/sessions/{active}/observations", json={"events": raw})
    before = client.get(f"/api/sessions/{active}").json()
    exported = {s["id"]: s for s in client.get("/api/exports/sessions?format=json").json()["sessions"]}
    assert exported[empty]["measurementVersion"] is None
    assert exported[empty]["questions"] == []
    assert exported[active] == before
    assert before["terminationState"] == "ongoing" and before["endedAt"] is None
    assert before["questions"][0]["observedUnfinishedDurationMs"] == 1
    assert before["questions"][0]["unfinishedDurationIsLowerBound"] is True
    assert len(list(csv.DictReader(io.StringIO(client.get("/api/exports/sessions?format=csv").text)))) == 1
    assert client.get(f"/api/sessions/{active}").json() == before
    assert client.get("/api/exports/sessions?format=xml").status_code == 422
    assert client.get("/api/sessions/missing/export?format=json").status_code == 404


def test_additive_legacy_migration_preserves_original_bytes(tmp_path):
    path = tmp_path / "old.sqlite3"
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE sessions(id TEXT PRIMARY KEY, config TEXT, seed TEXT, generator TEXT, policy TEXT, created_at TEXT, status TEXT)")
        original = json.dumps(configuration(), indent=2)
        db.execute("INSERT INTO sessions VALUES(?,?,?,?,?,?,?)", ("old", original, "old-seed", "old-generator", "old-policy", "old-time", "open"))
    for _ in range(2):
        with TestClient(create_app(path)) as client:
            record = client.get("/api/sessions/old/export?format=json").json()["sessions"][0]
            assert record["measurementVersion"] is None and record["seed"] == "old-seed"
        with sqlite3.connect(path) as db:
            assert db.execute("SELECT config,measurement_version FROM sessions").fetchone() == (original, None)


def test_legacy_completed_records_and_ended_no_question_session_export(client):
    identity = create(client, measurement=False)
    raw = events([START, ("question-presented", 0, {"question": question()}), ("answer-accepted", 25.125, {"questionId": "q0"}), end(30)])
    client.post(f"/api/sessions/{identity}/observations", json={"events": raw})
    record = client.get(f"/api/sessions/{identity}/export?format=json").json()["sessions"][0]
    assert record["measurementVersion"] is None
    assert record["summary"]["medianCorrectAnswerTimeMs"] == 25.125
    assert record["questions"][0]["firstInputTimeMs"] is None
    assert record["dataQualityWarnings"][0]["code"] == "unversioned-measurement"
    empty = create(client)
    client.post(f"/api/sessions/{empty}/observations", json={"events": events([end(0)])})
    record = client.get(f"/api/sessions/{empty}/export?format=json").json()["sessions"][0]
    assert record["terminationState"] == "ended" and record["questions"] == []
    assert record["summary"]["meanCorrectAnswerTimeMs"] is None
    assert list(csv.reader(io.StringIO(client.get(f"/api/sessions/{empty}/export?format=csv").text))) == [CSV_FIELDS]


@pytest.mark.parametrize("damage", ["deadline", "missing-end", "malformed-payload"])
def test_inconsistent_records_export_with_warnings_without_invalid_times(client, damage):
    identity = create(client)
    raw = events([START, ("question-presented", 10, {"question": question()}), ("answer-accepted", 20, {"questionId": "q0", "value": "21"}), end(30)])
    if damage == "deadline":
        raw[2]["elapsedMs"] = raw[3]["elapsedMs"] = 120000
    if damage == "missing-end":
        raw = raw[:2]
    if damage == "malformed-payload":
        raw[1]["payload"] = {"question": ["invalid"]}
    assert client.post(f"/api/sessions/{identity}/observations", json={"events": raw}).status_code == 200
    exported = client.get(f"/api/sessions/{identity}/export?format=json").json()["sessions"][0]
    assert exported["events"] == raw and exported["dataQualityWarnings"]
    assert exported["summary"]["validCorrectAnswerCount"] == 0
    rows = list(csv.DictReader(io.StringIO(client.get(f"/api/sessions/{identity}/export?format=csv").text)))
    assert len(rows) == 1 and rows[0]["correctAnswerTimeMs"] == ""
    assert json.loads(rows[0]["dataQualityWarningsJson"])


def test_export_pins_one_read_snapshot_during_concurrent_append(tmp_path, monkeypatch):
    import server.app as app_module
    path = tmp_path / "snapshot.sqlite3"
    client = TestClient(create_app(path))
    first, second = create(client), create(client)
    original = app_module.derive_session
    reached, written = Event(), Event()

    def blocked(session):
        reached.set()
        assert written.wait(5)
        return original(session)

    monkeypatch.setattr(app_module, "derive_session", blocked)
    append = events([START, end(0)])

    def writer():
        assert reached.wait(5)
        with sqlite3.connect(path) as db:
            for identity in (first, second):
                for event in append:
                    db.execute("INSERT INTO observations VALUES(?,?,?)", (identity, event["sequence"], json.dumps(event)))
                db.execute("UPDATE sessions SET status='ended' WHERE id=?", (identity,))
        written.set()

    thread = Thread(target=writer)
    thread.start()
    snapshot = client.get("/api/exports/sessions?format=json").json()
    thread.join(5)
    assert not thread.is_alive()
    assert all(s["status"] == "open" and s["events"] == [] for s in snapshot["sessions"])
    next_snapshot = client.get("/api/exports/sessions?format=json").json()
    assert all(s["status"] == "ended" and s["events"] == append for s in next_snapshot["sessions"])
