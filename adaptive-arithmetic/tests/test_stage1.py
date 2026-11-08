"""Synthetic full-platform acceptance; no normal user database mutation."""
from copy import deepcopy
from threading import Event, Thread
import csv
import io
import sqlite3
from fastapi.testclient import TestClient
import pytest
from server.app import create_app
from server.analytics import standard_config, histogram, enrich, analytics
from server.measurements import derive_session
from server.content import valid_pair_count, exact
from tests.test_api import configuration
from tests.test_measurements import events, START, question


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "stage1.sqlite3")) as client:
        yield client


def create(client, standard=True, config=None, legacy=False):
    body = {"config": config or (standard_config() if standard else configuration()), "seed": "stage1-test", "generatorVersion": "zetamac-reverse-v1" if standard else "exact-grid-v1", "policyVersion": "equal-operations-v1" if standard else "hierarchical-shares-v1"}
    if not legacy:
        body.update(mode="standard" if standard else "custom", contentVersion="zetamac-default-v1" if standard else "custom-grid-v1", measurementVersion="response-timing-v1")
    response = client.post("/api/sessions", json=body)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def trace(client, identity, times=(100, 300), standard=True, reason="timeout", known=True):
    raw = [START]; at = 0
    for i, duration in enumerate(times):
        q = question(f"q{i}", groupId="standard-addition" if standard else "g1", index=i, left="2" if standard else "10", right="100" if standard else "11", expected="102" if standard else "21", selection={"operationBasisPoints": 2500 if standard else 10000, "groupBasisPoints": 10000, "validPairCount": "9801" if standard else "8100"})
        raw.append(("question-presented", at, {"question": q})); at += duration
        raw.extend([("input-changed", at, {"questionId": q["id"], "value": q["expected"]}), ("answer-accepted", at, {"questionId": q["id"], "value": q["expected"]})])
    q = question("unfinished", groupId="standard-addition" if standard else "g1", left="2" if standard else "10", right="100" if standard else "11", expected="102" if standard else "21", selection={"operationBasisPoints": 2500 if standard else 10000, "groupBasisPoints": 10000, "validPairCount": "9801" if standard else "8100"})
    raw.append(("question-presented", at, {"question": q}))
    raw.append(("session-ended", 120000 if reason == "timeout" else at + 20, {"reason": reason, "endTimeKnown": known, "wallAt": "2026-10-09T12:02:00Z"}))
    assert client.post(f"/api/sessions/{identity}/observations", json={"events": events(raw)}).status_code == 200
    return client.get(f"/api/sessions/{identity}").json()


def test_standard_fixed_config_is_enforced_and_scores_export_agree(client):
    identity = create(client); saved = trace(client, identity)
    assert saved["mode"] == "standard" and saved["contentVersion"] == "zetamac-default-v1"
    assert saved["score"] == 2 and saved["comparisonEligible"] and saved["scoreState"] == "full"
    assert saved["summary"]["medianCorrectAnswerTimeMs"] == 200
    assert saved["analysis"]["summary"] == saved["summary"]
    assert client.get(f"/api/sessions/{identity}/export?format=json").json()["sessions"] == [saved]
    rows = list(csv.DictReader(io.StringIO(client.get(f"/api/sessions/{identity}/export?format=csv").text)))
    assert all(row["score"] == "2" and row["mode"] == "standard" and row["comparisonEligible"] == "true" for row in rows)
    broken = standard_config(); broken["session"]["durationSeconds"] = "30"
    body = {"config": broken, "seed": "bad", "mode": "standard", "contentVersion": "zetamac-default-v1", "measurementVersion": "response-timing-v1", "generatorVersion": "zetamac-reverse-v1", "policyVersion": "equal-operations-v1"}
    assert client.post("/api/sessions", json=body).status_code == 422
    body["config"] = standard_config(); body["generatorVersion"] = "exact-grid-v1"
    assert client.post("/api/sessions", json=body).status_code == 422


@pytest.mark.parametrize("reason,known", [("manual-end", True), ("focus-loss", True), ("interrupted-reload", False)])
def test_partial_and_unknown_end_runs_are_visible_but_excluded(client, reason, known):
    identity = create(client); result = trace(client, identity, reason=reason, known=known)
    assert result["score"] == 2 and result["scoreState"] == "partial" and not result["comparisonEligible"]
    assert "Inconsistent observations" not in result["comparisonExclusionReasons"]
    if not known:
        assert "Ongoing or unknown actual end" in result["comparisonExclusionReasons"]
        assert any(w["code"] == "unknown-end-time" for w in result["dataQualityWarnings"])
    assert result["endedAt"] is None if not known else result["endedAt"] is not None
    data = client.get("/api/analytics").json()
    assert data["eligibleSessionCount"] == 0 and data["excludedSessionCount"] == 1 and data["trend"] == []
    assert data["summary"]["validCorrectAnswerCount"] == 0
    included = client.get("/api/analytics?includePartial=true").json()
    assert included["summary"]["validCorrectAnswerCount"] == 2
    assert included["trend"] == []


def test_full_zero_score_is_real_with_empty_timing_summary(client):
    identity = create(client); saved = trace(client, identity, times=())
    assert saved["score"] == 0 and saved["comparisonEligible"]
    data = client.get("/api/analytics").json()
    assert data["trend"][0]["score"] == 0 and data["histogram"] == []
    assert data["summary"]["medianCorrectAnswerTimeMs"] is None


def test_full_run_statistics_distinguish_pooled_and_equal_run_weighting(client):
    for times in ((100,), (200, 200, 800), (1000, 3000), ()):
        trace(client, create(client), times=times)
    trace(client, create(client), times=(90000,), reason="manual-end")
    trace(client, create(client, standard=False), standard=False)
    data = client.get("/api/analytics").json()
    stats = data["fullRunStatistics"]
    assert stats["runCount"] == 4
    assert stats["meanScore"] == stats["medianScore"] == 1.5
    assert stats["answerSummary"]["validCorrectAnswerCount"] == 6
    assert stats["answerSummary"]["meanCorrectAnswerTimeMs"] == pytest.approx(5300 / 6)
    assert stats["answerSummary"]["medianCorrectAnswerTimeMs"] == 500
    assert stats["runTiming"] == {
        "contributingRunCount": 3,
        "meanRunMeanMs": pytest.approx(2500 / 3), "medianRunMeanMs": 400,
        "meanRunMedianMs": pytest.approx(2300 / 3), "medianRunMedianMs": 200,
    }
    included = client.get("/api/analytics?includePartial=true").json()
    assert included["fullRunStatistics"] == stats
    assert included["summary"]["validCorrectAnswerCount"] == 7
    assert client.get("/api/analytics?after=2999-01-01").json()["fullRunStatistics"]["meanScore"] is None
    custom = next(c for c in data["cohorts"] if c["mode"] == "custom")
    assert client.get("/api/analytics", params={"cohort": custom["key"]}).json()["fullRunStatistics"]["runCount"] == 1


def test_zero_and_empty_full_run_statistics_have_distinct_missing_values(client):
    empty = client.get("/api/analytics").json()["fullRunStatistics"]
    assert empty["runCount"] == 0 and empty["meanScore"] is None and empty["medianScore"] is None
    trace(client, create(client), times=())
    zero = client.get("/api/analytics").json()["fullRunStatistics"]
    assert zero["runCount"] == 1 and zero["meanScore"] == zero["medianScore"] == 0
    assert zero["answerSummary"]["meanCorrectAnswerTimeMs"] is None
    assert zero["runTiming"]["contributingRunCount"] == 0
    assert all(value is None for key, value in zero["runTiming"].items() if key != "contributingRunCount")


def test_history_eligibility_filter_precedes_pagination_and_preserves_api_default(client):
    full = [trace(client, create(client))["id"] for _ in range(3)]
    trace(client, create(client), reason="manual-end")
    create(client)
    assert client.get("/api/sessions").json()["total"] == 5
    assert client.get("/api/sessions?eligibleOnly=false").json()["total"] == 5
    selected = client.get("/api/sessions?eligibleOnly=true&limit=2&offset=2").json()
    assert selected["total"] == 3 and len(selected["sessions"]) == 1
    assert selected["sessions"][0]["id"] in full
    assert selected["sessions"][0]["comparisonEligible"]
    assert client.get("/api/sessions?eligibleOnly=true&status=ongoing").json()["total"] == 0
    assert client.get("/api/sessions?eligibleOnly=true&mode=custom").json()["total"] == 0
    assert client.get("/api/sessions?eligibleOnly=true&configuration=standard-addition").json()["total"] == 3
    assert client.get("/api/sessions?eligibleOnly=true&before=1900-01-01").json()["total"] == 0


def test_legacy_similar_config_is_never_inferred_as_standard(client):
    identity = create(client, standard=False, config=standard_config(), legacy=True)
    saved = trace(client, identity, standard=True)
    assert saved["mode"] is None and saved["contentVersion"] is None and saved["measurementVersion"] is None
    assert not saved["comparisonEligible"] and saved["config"] == standard_config()
    assert client.get("/api/sessions?mode=legacy").json()["total"] == 1
    assert client.get("/api/sessions?mode=standard").json()["total"] == 0


def test_history_pagination_status_date_configuration_and_read_only_open_session(client):
    identities = [create(client, standard=False) for _ in range(24)]
    closed = trace(client, identities[0], standard=False)
    before = client.get(f"/api/sessions/{identities[-1]}").json()
    assert "Ongoing or unknown actual end" in before["comparisonExclusionReasons"]
    assert "Inconsistent observations" not in before["comparisonExclusionReasons"]
    first = client.get("/api/sessions?limit=20").json(); second = client.get("/api/sessions?limit=20&offset=20").json()
    assert first["total"] == 24 and len(first["sessions"]) == 20 and len(second["sessions"]) == 4
    assert set(s["id"] for s in first["sessions"]).isdisjoint(s["id"] for s in second["sessions"])
    assert client.get("/api/sessions?status=ongoing").json()["total"] == 23
    assert client.get("/api/sessions?status=ended&configuration=g1").json()["total"] == 1
    day = closed["createdAt"][:10]
    assert client.get(f"/api/sessions?after={day}&before={day}").json()["total"] == 24
    assert client.get("/api/sessions?before=2000-01-01").json()["total"] == 0
    assert client.get("/api/sessions?limit=0").status_code == 422
    client.get("/api/analytics?includePartial=true")
    assert client.get(f"/api/sessions/{identities[-1]}").json() == before


def test_cohort_identity_uses_actual_versions_settings_and_config_not_preset(client):
    config = configuration(); preset = client.post("/api/presets", json={"name": "Saved", "config": config}).json()["id"]
    identity = create(client, standard=False, config=config); original = trace(client, identity, standard=False)
    changed = deepcopy(config); changed["operations"][0]["groups"][0]["name"] = "renamed"
    client.put(f"/api/presets/{preset}", json={"name": "Renamed preset", "config": changed}); client.delete(f"/api/presets/{preset}")
    assert client.get(f"/api/sessions/{identity}").json() == original
    sessions = [original]
    for key, value in [("mode", None), ("contentVersion", None), ("generatorVersion", "other"), ("policyVersion", "other"), ("measurementVersion", None)]:
        raw = {k: deepcopy(original[k]) for k in ("id", "config", "seed", "mode", "contentVersion", "generatorVersion", "policyVersion", "measurementVersion", "createdAt", "status", "events")}; raw[key] = value
        sessions.append(enrich(derive_session(raw)))
    raw = {k: deepcopy(original[k]) for k in ("id", "config", "seed", "mode", "contentVersion", "generatorVersion", "policyVersion", "measurementVersion", "createdAt", "status", "events")}; raw["config"] = changed
    sessions.append(enrich(derive_session(raw)))
    assert len({s["cohortKey"] for s in sessions}) == len(sessions)


@pytest.mark.parametrize("values", [[], [0], [0, 0, 0], [5, 5], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [.123 + i * ((.456 - .123) / 10) for i in range(11)]])
def test_histogram_bin_totals_and_exact_returned_edge_membership(values):
    bins = histogram(values)
    assert sum(b["count"] for b in bins) == len(values)
    for b in bins:
        expected = sum(b["lowerMs"] <= v and (v <= b["upperMs"] if b["upperInclusive"] else v < b["upperMs"]) for v in values)
        assert b["count"] == expected


def test_breakdown_sequence_and_histogram_share_observations(client):
    identity = create(client); saved = trace(client, identity, times=(0, 100, 500))
    data = client.get("/api/analytics").json()
    assert data["summary"] == saved["summary"]
    assert sum(b["count"] for b in data["histogram"]) == 3
    assert data["breakdown"][0]["validCorrectAnswerCount"] == 3
    assert data["breakdown"][0]["medianCorrectAnswerTimeMs"] == 100
    assert saved["questions"][-1]["observedUnfinishedDurationMs"] == 119400
    assert saved["questions"][-1]["unfinishedDurationIsLowerBound"] is False


def test_malformed_standard_content_preserves_raw_with_warnings_and_no_full_score(client):
    identity = create(client)
    bad = question(groupId="standard-addition", left="2", right="100", expected="102", selection="broken")
    raw = events([START, ("question-presented", 0, {"question": bad}), ("answer-accepted", 100, {"questionId": "q0", "value": "1e2"}), ("session-ended", 120000, {"reason": "timeout", "endTimeKnown": True})])
    client.post(f"/api/sessions/{identity}/observations", json={"events": raw})
    result = client.get(f"/api/sessions/{identity}").json()
    assert result["events"] == raw and not result["comparisonEligible"]
    assert any(w["code"] == "invalid-content-trace" for w in result["dataQualityWarnings"])
    assert result["summary"]["validCorrectAnswerCount"] == 0
    assert client.get("/api/analytics?includePartial=true").json()["histogram"] == []
    assert client.get(f"/api/sessions/{identity}/export?format=json").status_code == 200


def test_large_exact_custom_product_is_not_rounded_for_eligibility(client):
    config = configuration(); config["operations"][0]["id"] = "multiplication"
    value = "999999999999999999999999999999.999"
    group = config["operations"][0]["groups"][0]
    group["first"] = group["second"] = {"min": value, "max": value, "decimalPlaces": 3}
    identity = create(client, standard=False, config=config)
    coefficient = int(value.replace(".", "")); product = str(coefficient * coefficient)
    answer = product[:-6] + "." + product[-6:]
    q = question(operation="multiplication", left=value, right=value, expected=answer, selection={"operationBasisPoints":10000,"groupBasisPoints":10000,"validPairCount":"1"})
    raw = events([START, ("question-presented", 0, {"question": q}), ("answer-accepted", 1, {"questionId": "q0", "value": answer}), ("session-ended", 120000, {"reason": "timeout", "endTimeKnown": True})])
    client.post(f"/api/sessions/{identity}/observations", json={"events": raw})
    assert client.get(f"/api/sessions/{identity}").json()["comparisonEligible"]


def test_standard_false_pair_counts_are_retained_but_excluded_for_every_operation(client):
    for op, left, right, answer in [("addition","2","100","102"), ("subtraction","102","2","100"), ("multiplication","2","100","200"), ("division","200","2","100")]:
        identity = create(client)
        q = question(operation=op, groupId="standard-"+op, left=left, right=right, expected=answer, selection={"operationBasisPoints":2500,"groupBasisPoints":10000,"validPairCount":"1"})
        raw = events([START, ("question-presented",0,{"question":q}), ("answer-accepted",100,{"questionId":"q0","value":answer}), ("session-ended",120000,{"reason":"timeout","endTimeKnown":True})])
        client.post(f"/api/sessions/{identity}/observations", json={"events":raw})
        saved = client.get(f"/api/sessions/{identity}").json()
        assert saved["events"] == raw and saved["questions"][0]["selection"]["validPairCount"] == "1"
        assert not saved["comparisonEligible"] and saved["summary"]["validCorrectAnswerCount"] == 0
        assert saved["questions"][0]["correctAnswerTimeMs"] is None
        assert client.get(f"/api/sessions/{identity}/export?format=json").json()["sessions"][0] == saved
    assert client.get("/api/analytics?includePartial=true").json()["histogram"] == []


@pytest.mark.parametrize("bad_identity", [{"operation":{}}, {"groupId":[]}, {"id":{}}, {"index":False}])
def test_malformed_identity_read_export_history_and_analytics_remain_inspectable(client, bad_identity):
    identity = create(client)
    q = question(groupId="standard-addition", **bad_identity) if "groupId" not in bad_identity else question(**bad_identity)
    raw = events([START, ("question-presented", 0, {"question": q}), ("session-ended", 120000, {"reason": "timeout", "endTimeKnown": True})])
    client.post(f"/api/sessions/{identity}/observations", json={"events":raw})
    saved = client.get(f"/api/sessions/{identity}").json()
    assert saved["events"] == raw and saved["dataQualityWarnings"]
    for endpoint in (f"/api/sessions/{identity}/export?format=json", f"/api/sessions/{identity}/export?format=csv", "/api/sessions", "/api/analytics?includePartial=true"):
        assert client.get(endpoint).status_code == 200


@pytest.mark.parametrize("damage", ["range", "precision", "share", "count", "negative"])
def test_custom_out_of_configuration_traces_are_not_valid_observations(client, damage):
    config = configuration(); q = question()
    if damage == "range": q.update(left="1", right="2", expected="3")
    if damage == "precision": q.update(left="10.1", right="11", expected="21.1")
    if damage == "share": q["selection"]["operationBasisPoints"] = 0
    if damage == "count": q["selection"]["validPairCount"] = "1"
    if damage == "negative":
        config["operations"][0]["id"] = "subtraction"; q.update(operation="subtraction", left="10", right="11", expected="-1")
        q["selection"]["validPairCount"] = "4095"
    identity = create(client, standard=False, config=config)
    raw = events([START, ("question-presented", 0, {"question": q}), ("answer-accepted", 100, {"questionId":"q0", "value":q["expected"]}), ("session-ended",120000,{"reason":"timeout","endTimeKnown":True})])
    client.post(f"/api/sessions/{identity}/observations", json={"events":raw})
    saved = client.get(f"/api/sessions/{identity}").json()
    assert not saved["comparisonEligible"] and saved["summary"]["validCorrectAnswerCount"] == 0
    assert client.get("/api/analytics?includePartial=true").json()["histogram"] == []


def test_confirmed_exact_deletion_scope_protects_open_rows_new_arrivals_and_settings(client):
    client.put("/api/last-config", json=configuration())
    preset = client.post("/api/presets", json={"name": "Keep", "config": configuration()}).json()["id"]
    closed = create(client); trace(client, closed)
    ongoing = create(client)
    preview = client.get("/api/sessions/deletion-preview").json()
    assert preview["sessionIds"] == [closed] and preview["protectedCount"] == 1
    late = create(client); trace(client, late)
    failed = client.request("DELETE", "/api/sessions", json={"sessionIds": [closed, ongoing]})
    assert failed.status_code == 409
    assert client.get(f"/api/sessions/{closed}").status_code == 200
    assert client.delete(f"/api/sessions/{ongoing}").status_code == 409
    assert client.request("DELETE", "/api/sessions", json={"sessionIds": preview["sessionIds"]}).json()["deletedCount"] == 1
    assert client.get(f"/api/sessions/{closed}").status_code == 404
    assert {s["id"] for s in client.get("/api/exports/sessions?format=json").json()["sessions"]} == {late, ongoing}
    setup = client.get("/api/setup").json()
    assert setup["lastConfig"] == configuration() and setup["presets"][0]["id"] == preset


def test_history_read_snapshot_survives_concurrent_atomic_deletion(tmp_path, monkeypatch):
    import server.app as module
    with TestClient(create_app(tmp_path / "concurrent.sqlite3")) as client:
        identities = [create(client) for _ in range(2)]
        for identity in identities: trace(client, identity)
        entered, proceed = Event(), Event(); original = module.add_details
        def blocked(session):
            if not entered.is_set():
                entered.set(); assert proceed.wait(5)
            return original(session)
        # Detailed export materialization still occurs inside the read snapshot
        # even when prior detail reads have warmed the session derivation cache.
        monkeypatch.setattr(module, "add_details", blocked)
        results = []
        reader = Thread(target=lambda: results.append(client.get("/api/exports/sessions?format=json")))
        reader.start(); assert entered.wait(5)
        assert client.delete(f"/api/sessions/{identities[1]}").status_code == 200
        proceed.set(); reader.join(5)
        snapshot = results[0].json()["sessions"]
        assert len(snapshot) == 2 and all(len(s["questions"]) == 3 for s in snapshot)
        assert client.get("/api/sessions").json()["total"] == 1


def test_bulk_deletion_accepts_entire_confirmed_history_above_ten_thousand(tmp_path):
    """Indefinite retention must not make the complete confirmed scope undeletable."""
    database = tmp_path / "large-history.sqlite3"
    with TestClient(create_app(database)) as client:
        template = create(client)
        with sqlite3.connect(database) as db:
            row = db.execute("SELECT * FROM sessions WHERE id=?", (template,)).fetchone()
            identities = [f"closed-{i}" for i in range(10001)]
            closed_rows = [(identity, *row[1:6], "ended", *row[7:]) for identity in identities]
            db.executemany("INSERT INTO sessions VALUES(" + ",".join("?" for _ in row) + ")", closed_rows)
            terminal = events([("session-ended", 0, {"reason":"manual-end", "endTimeKnown":True})])[0]
            import json
            db.executemany("INSERT INTO observations VALUES(?,?,?)", [(identity, 0, json.dumps(terminal)) for identity in identities])
        preview = client.get("/api/sessions/deletion-preview").json()
        assert preview["count"] == 10001 and preview["protectedCount"] == 1
        # Rechecking any protected member still rolls back the entire large scope.
        denied = client.request("DELETE", "/api/sessions", json={"sessionIds": [*preview["sessionIds"], template]})
        assert denied.status_code == 409
        with sqlite3.connect(database) as db:
            assert db.execute("SELECT COUNT(*) FROM observations").fetchone()[0] == 10001
        result = client.request("DELETE", "/api/sessions", json={"sessionIds": preview["sessionIds"]})
        assert result.status_code == 200 and result.json()["deletedCount"] == 10001
        with sqlite3.connect(database) as db:
            assert db.execute("SELECT COUNT(*) FROM observations").fetchone()[0] == 0
            assert db.execute("SELECT id FROM sessions").fetchall() == [(template,)]


def test_exact_custom_provenance_pair_counts_match_signed_mixed_precision_enumeration():
    for precision_a in range(3):
        for precision_b in range(3):
            for low_a in range(-3, 3):
                for low_b in range(-3, 3):
                    group = {"first":{"min":str(low_a / 10 ** precision_a),"max":str((low_a + 4) / 10 ** precision_a),"decimalPlaces":precision_a},"second":{"min":str(low_b / 10 ** precision_b),"max":str((low_b + 3) / 10 ** precision_b),"decimalPlaces":precision_b},"allowNegative":False}
                    expected = sum(a * 10 ** precision_b >= b * 10 ** precision_a for a in range(low_a, low_a + 5) for b in range(low_b, low_b + 4))
                    assert valid_pair_count("subtraction", group) == expected
