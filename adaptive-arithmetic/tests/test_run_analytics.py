"""Synthetic explorer evidence; no normal practice data is used."""
from copy import deepcopy
import csv
import io
from fastapi.testclient import TestClient
from server.app import create_app
from server.analytics import enrich
from server.measurements import derive_session
from tests.test_stage1 import create, trace
from tests.test_next_improvements import body


def edited(client):
    identity = create(client)
    saved = trace(client, identity, times=(1000, 1800))
    # Use a new session; immutable logs are never rewritten.
    identity = create(client)
    raw = deepcopy(saved["events"])
    # q0 expected 102, a normal prefix then a quick single-character repair.
    at = next(i for i, e in enumerate(raw) if e["type"] == "input-changed")
    original = raw[at]
    frames = []
    for t, value in ((200, "1"), (400, "10"), (600, "103"), (800, "10"), (1000, "102")):
        frames.append({**original, "elapsedMs": t, "payload": {"questionId": "q0", "value": value, "inputType": "deleteContentBackward" if t == 800 else "insertText", "telemetryVersion": "answer-edits-v2"}})
    raw[at:at + 1] = frames
    for i, e in enumerate(raw):
        e["sequence"] = i
    assert client.post(f"/api/sessions/{identity}/observations", json={"events": raw}).status_code == 200
    return client.get(f"/api/sessions/{identity}").json()


def test_edit_metrics_replay_and_time_partition(tmp_path):
    with TestClient(create_app(tmp_path / "edits.db")) as c:
        s = edited(c)
        r = s["runAnalytics"]
        q = r["questions"][0]
        assert q["totalMs"] == 1000 and q["firstMs"] == 200 and q["entryMs"] == 800
        assert q["charactersInserted"] == 4 and q["charactersRemoved"] == 1
        assert q["revisionEpisodes"] == 1 and q["revisionToAcceptanceMs"] == 200
        assert q["hypothesis"] == "possible mistype"
        assert q["frames"][-1]["value"] == "102" and q["telemetry"] == "answer-edits-v2"
        assert r["questions"][1]["deltaMs"] == 800
        assert r["questions"][1]["rollingMedianMs"] == 1400
        assert sum(item["ms"] for item in r["timeBreakdown"]) == 120000
        assert r["summary"]["revisedCompleted"] == 1
        assert r["splits"][0]["count"] == 2
        assert len(r["splits"]) == 8
        assert s["comparisonEligible"]


def test_labels_are_revision_checked_exported_and_deleted_with_session(tmp_path):
    with TestClient(create_app(tmp_path / "labels.db")) as c:
        s = edited(c); identity = s["id"]; sequence = s["questions"][0]["presentationSequence"]
        url = f"/api/sessions/{identity}/annotations/{sequence}"
        assert c.put(url, json={"label": "mistyped", "expectedRevision": 0}).json()["revision"] == 1
        assert c.put(url, json={"label": "recalculated", "expectedRevision": 0}).status_code == 409
        result = c.get(f"/api/sessions/{identity}").json()
        assert result["events"] == s["events"] and result["summary"] == s["summary"]
        assert result["annotations"][0]["label"] == "mistyped"
        exported = c.get(f"/api/sessions/{identity}/export?format=json").json()["sessions"][0]
        assert exported["annotations"] == result["annotations"]
        rows = list(csv.DictReader(io.StringIO(c.get(f"/api/sessions/{identity}/export?format=csv").text)))
        assert '"label":"mistyped"' in rows[0]["annotationsJson"]
        assert c.delete(f"/api/sessions/{identity}").status_code == 200
        assert c.put(url, json={"label": "unsure", "expectedRevision": 1}).status_code == 404
        other = create(c)
        assert c.put(f"/api/sessions/{other}/annotations/0", json={"label": "unsure", "expectedRevision": 0}).status_code == 404


def test_seed_challenge_provenance_eligibility_retry_and_source_preservation(tmp_path):
    with TestClient(create_app(tmp_path / "challenge.db")) as c:
        s = trace(c, create(c)); original = c.get(f'/api/sessions/{s["id"]}').json()
        request = body("challenge"); request.update(seed=s["seed"], replayOf=s["id"])
        response = c.post("/api/sessions", json=request)
        assert response.status_code == 201, response.text
        identity = response.json()["id"]
        assert c.post("/api/sessions", json=request).json()["id"] == identity
        saved = trace(c, identity)
        assert not saved["comparisonEligible"] and saved["cohortKey"] != original["cohortKey"]
        assert saved["replayOf"] == s["id"]
        assert c.get(f'/api/sessions/{s["id"]}').json() == original
        assert c.post("/api/sessions", json={**request, "creationKey": "wrong", "seed": "not-the-seed"}).status_code == 422
        # Lost-response retries survive source deletion in another page.
        assert c.delete(f'/api/sessions/{s["id"]}').status_code == 200
        assert c.post("/api/sessions", json=request).json()["id"] == identity
        assert c.post("/api/sessions", json={**request, "seed": "changed"}).status_code == 409
        continued = {**request, "creationKey": "next-challenge", "replayOf": identity}
        assert c.post("/api/sessions", json=continued).status_code == 201


def test_profiles_baselines_are_sample_counted_and_earlier_only(tmp_path):
    with TestClient(create_app(tmp_path / "profiles.db")) as c:
        earlier = trace(c, create(c), times=(100, 200))
        s = edited(c)
        trace(c, create(c), times=(90000,))
        context = c.get(f'/api/explorer/{s["id"]}').json()
        key = "addition|answer length: 3 digits|operand size: 3 digits"
        # edited() also saved one original trace before its edited copy.
        assert context["baselines"][key]["count"] == 4
        assert context["baselines"][key]["medianMs"] == 600
        feature = next(p for p in context["profile"] if p["feature"] == "removed digit: 3")
        assert feature["count"] == 1 and feature["revisedCount"] == 1
        assert c.get("/api/explorer/missing").status_code == 404


def test_unfinished_unknown_and_invalid_timings_remain_unknown(tmp_path):
    with TestClient(create_app(tmp_path / "invalid.db")) as c:
        s = trace(c, create(c), reason="interrupted-reload", known=False)
        assert s["runAnalytics"]["questions"][-1]["lowerBound"]
        damaged = deepcopy(s)
        damaged["events"][2]["payload"] = None
        damaged["events"][1]["sequence"] = "bad"
        derived = enrich(derive_session(damaged))
        assert derived["runAnalytics"]["questions"][0]["totalMs"] is None
        assert all(f["atMs"] is None for q in derived["runAnalytics"]["questions"] for f in q["frames"])


def test_split_boundary_and_zero_duration(tmp_path):
    with TestClient(create_app(tmp_path / "splits.db")) as c:
        s = trace(c, create(c), times=(15000, 15000))
        splits = s["runAnalytics"]["splits"]
        assert [part["count"] for part in splits[:3]] == [0, 1, 1]
        zero = trace(c, create(c), times=(), reason="manual-end")
        assert zero["runAnalytics"]["summary"]["p90Ms"] is None
        assert zero["runAnalytics"]["timeBreakdown"][-1]["ms"] == 0


def test_review_replay_stops_at_acceptance_and_terminal(tmp_path):
    with TestClient(create_app(tmp_path / "intervals.db")) as c:
        s = trace(c, create(c), times=(1000, 2000))
        raw = deepcopy(s["events"])
        raw.insert(4, {"type": "input-changed", "elapsedMs": 1001, "payload": {"questionId": "q0", "value": "10"}})
        for i, e in enumerate(raw): e["sequence"] = i
        result = enrich(derive_session({**s, "events": raw}))
        assert result["questions"][0]["correctAnswerTimeMs"] == 1000
        q = result["runAnalytics"]["questions"][0]
        assert q["inputChanges"] == 1 and q["revisionEpisodes"] == 0
        assert all(f["atMs"] <= 1000 for f in q["frames"])
        # Inputs beyond the terminal event never belong to the unfinished field.
        raw = deepcopy(s["events"])
        raw.append({"sequence": len(raw), "type": "input-changed", "elapsedMs": 120001, "payload": {"questionId": "unfinished", "value": "x"}})
        result = enrich(derive_session({**s, "events": raw}))
        assert result["runAnalytics"]["questions"][-1]["frames"] == []


def test_review_damaged_clock_does_not_crash_and_composition_stays_unknown(tmp_path):
    with TestClient(create_app(tmp_path / "clock.db")) as c:
        s = edited(c)
        raw = deepcopy(s["events"]); raw[2]["elapsedMs"] = "bad"
        result = enrich(derive_session({**s, "events": raw}))
        assert result["runAnalytics"]["questions"][0]["totalMs"] is None
        raw = deepcopy(s["events"])
        raw[2]["payload"]["isComposing"] = True
        result = enrich(derive_session({**s, "events": raw}))
        assert result["runAnalytics"]["questions"][0]["hypothesis"] == "unknown"


def test_review_fractional_terminal_split_keeps_last_completion(tmp_path):
    with TestClient(create_app(tmp_path / "fractional.db")) as c:
        s = trace(c, create(c), times=(15000.1,))
        s["events"][-1]["elapsedMs"] = 15000.2
        s["events"][-1]["payload"]["reason"] = "manual-end"
        result = enrich(derive_session(s))["runAnalytics"]
        assert len(result["splits"]) == 2
        assert result["splits"][-1]["count"] == 1
        assert sum(split["count"] for split in result["splits"]) == result["summary"]["completed"]
