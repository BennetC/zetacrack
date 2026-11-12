"""Fresh synthetic records only; fixture is also asserted by the TS generator."""
from copy import deepcopy
import csv
import io
import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from server.app import create_app
from server.optiver import optiver_config, trace_valid, value, PROFILES
from tests.test_stage1 import create as create_standard, trace as trace_standard

PAPER = json.loads((Path(__file__).parent / "fixtures/optiver-paper.json").read_text(encoding="utf-8"))


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "optiver.sqlite3")) as client:
        yield client


def body(**overrides):
    return {"config": optiver_config(), "seed": "cross-stack-optiver", "mode": "optiver", "contentVersion": "optiver-80-in-8-v1",
            "generatorVersion": "optiver-rational-v1", "policyVersion": "optiver-profile-v1", "measurementVersion": "choice-response-v1", **overrides}


def create(client, **overrides):
    r = client.post("/api/sessions", json=body(**overrides))
    assert r.status_code == 201, r.text
    return r.json()["id"]


def events(correct=68, count=80, end="completed", known=True, spacing=1000):
    raw = [("session-started", 0, {"wallAt": "2026-11-11T10:00:00Z"})]
    for i in range(count):
        q = deepcopy(PAPER["questions"][i])
        raw.append(("question-presented", i * spacing, {"question": q}))
        options = q["optiver"]["options"]
        option = next(j for j, v in enumerate(options) if (value(v) == value(q["expected"])) == (i < correct))
        raw.append(("answer-submitted", (i + 1) * spacing - 10, {"questionId": q["id"], "optionIndex": option, "value": options[option]}))
    if count < 80:
        raw.append(("question-presented", count * spacing, {"question": deepcopy(PAPER["questions"][count])}))
    at = 480000 if end == "timeout" else count * spacing
    raw.append(("session-ended", at, {"reason": end, "endTimeKnown": known, "wallAt": "2026-11-11T10:08:00Z"}))
    return [{"sequence": i, "type": kind, "elapsedMs": at, "payload": p} for i, (kind, at, p) in enumerate(raw)]


def save(client, identity, raw):
    r = client.post(f"/api/sessions/{identity}/observations", json={"events": raw})
    assert r.status_code == 200, r.text
    return client.get(f"/api/sessions/{identity}").json()


def test_cross_stack_profile_and_rational_choices():
    assert PAPER["config"] == optiver_config()
    assert len(PROFILES) == len(PAPER["questions"]) == 80
    assert all(trace_valid(q, i) for i, q in enumerate(PAPER["questions"]))
    assert value("29 3/4") == value("29.75")
    assert value("-2 1/3") == value("-7/3")


@pytest.mark.parametrize("change", [
    {"generatorVersion": "exact-grid-v1"}, {"policyVersion": "equal-operations-v1"},
    {"measurementVersion": "response-timing-v1"}, {"contentVersion": "custom-grid-v1"},
    {"config": {**optiver_config(), "session": {"format": "timed", "durationSeconds": "120", "countdown": False}}},
    {"mode": "custom"},
])
def test_new_optiver_sessions_enforce_fixed_contract(client, change):
    assert client.post("/api/sessions", json=body(**change)).status_code == 422


@pytest.mark.parametrize("correct,net,passed", [(68, 56, True), (67, 54, False), (0, -80, False), (80, 80, True)])
def test_all_80_choices_end_early_with_net_score_and_exact_timings(client, correct, net, passed):
    saved = save(client, create(client), events(correct=correct))
    assert saved["comparisonEligible"], saved["dataQualityWarnings"]
    assert saved["score"] == net and saved["scoreState"] == "full"
    s = saved["optiverSummary"]
    assert (s["correct"], s["incorrect"], s["attempted"], s["unanswered"], s["passed"]) == (correct, 80-correct, 80, 0, passed)
    assert s["accuracy"] == correct / 80
    assert s["validResponseCount"] == 80 and s["medianResponseTimeMs"] == 990
    assert saved["summary"]["validCorrectAnswerCount"] == correct
    assert saved["summary"]["medianCorrectAnswerTimeMs"] == (990 if correct else None)
    assert all(q["responseTimeMs"] == 990 and q["firstInputTimeMs"] is None for q in saved["questions"])
    assert saved["runAnalytics"] is None


def test_timeout_unanswered_and_zero_attempts_are_valid_full_tests(client):
    saved = save(client, create(client), events(correct=2, count=3, end="timeout"))
    assert saved["comparisonEligible"] and saved["score"] == 1
    assert saved["optiverSummary"]["unanswered"] == 77 and saved["optiverSummary"]["accuracy"] == pytest.approx(2/3)
    assert saved["questions"][-1]["outcome"] == "unfinished"
    assert saved["questions"][-1]["observedUnfinishedDurationMs"] == 477000
    zero = save(client, create(client), events(count=0, end="timeout"))
    assert zero["comparisonEligible"] and zero["score"] == 0
    assert zero["optiverSummary"]["accuracy"] is None and zero["optiverSummary"]["unanswered"] == 80


def test_dedicated_metrics_never_pool_other_modes_partial_or_challenges(client):
    full_id = create(client)
    full = save(client, full_id, events())
    save(client, create(client), events(correct=2, count=3, end="manual-end"))
    challenge = save(client, create(client, replayOf=full_id), events(correct=80))
    assert not challenge["comparisonEligible"] and challenge["cohortKey"] != full["cohortKey"]
    standard = trace_standard(client, create_standard(client))
    assert standard["comparisonEligible"]
    data = client.get("/api/optiver/analytics").json()
    assert data["savedRunCount"] == 3 and data["excludedRunCount"] == 2
    assert data["statistics"]["runCount"] == 1 and data["statistics"]["attempted"] == 80
    assert data["statistics"]["passRate"] == 1 and data["statistics"]["accuracy"] == .85
    assert sum(r["attempted"] for r in data["statistics"]["pace"]) == 80
    assert sum(r["attempted"] for r in data["statistics"]["breakdown"] if r["level"] == "kind") == 80
    graph = client.get("/api/analytics", params={"cohort": full["cohortKey"]}).json()
    assert len(graph["trend"]) == 1 and graph["trend"][0]["score"] == 56
    assert graph["optiverStatistics"]["incorrect"] == 12
    history = client.get("/api/sessions?mode=optiver&eligibleOnly=true").json()
    assert history["total"] == 1 and history["sessions"][0]["id"] == full_id
    assert client.get("/api/optiver/analytics?after=2099-01-01").json()["statistics"]["runCount"] == 0


def test_exports_keep_raw_choices_incorrect_answers_and_rational_equations(client):
    identity = create(client)
    raw = events()
    saved = save(client, identity, raw)
    download = client.get(f"/api/sessions/{identity}/export?format=json").json()
    assert download["timingDefinitions"]["version"] == "choice-response-v1"
    assert download["measurementDefinitions"]["choice-response-v1"]["firstInputTimeMs"].startswith("Null")
    exported = download["sessions"][0]
    assert exported == saved and exported["events"] == raw
    rows = list(csv.DictReader(io.StringIO(client.get(f"/api/sessions/{identity}/export?format=csv").text)))
    assert len(rows) == 80 and sum(r["outcome"] == "incorrect" for r in rows) == 12
    for q, row in zip(saved["questions"], rows):
        assert json.loads(row["optiverQuestionJson"]) == q["optiver"]
        assert json.loads(row["acceptedInputJson"]) == q["acceptedInput"]
        assert json.loads(row["optiverSummaryJson"]) == saved["optiverSummary"]
        assert row["score"] == "56" and float(row["responseTimeMs"]) == 990


@pytest.mark.parametrize("damage", ["duplicate", "wrong-value", "deadline", "profile", "same-option", "equation", "early-complete", "unknown-end", "typed-event"])
def test_invalid_traces_are_inspectable_but_excluded_from_benchmarks(client, damage):
    raw = events(count=3, end="timeout")
    if damage == "duplicate":
        raw.insert(3, deepcopy(raw[2]))
        for i, e in enumerate(raw): e["sequence"] = i
    elif damage == "wrong-value": raw[2]["payload"]["value"] = "not an option"
    elif damage == "deadline":
        for e in raw[2:]: e["elapsedMs"] = 480000
    elif damage == "profile": raw[1]["payload"]["question"]["optiver"]["profileIndex"] = 70
    elif damage == "same-option": raw[1]["payload"]["question"]["optiver"]["options"] = ["1"] * 4
    elif damage == "equation": raw[1]["payload"]["question"]["left"] = "1"
    elif damage == "early-complete": raw[-1]["payload"]["reason"] = "completed"
    elif damage == "unknown-end": raw[-1]["payload"]["endTimeKnown"] = False
    elif damage == "typed-event": raw[2]["type"] = "answer-accepted"
    saved = save(client, create(client), raw)
    assert not saved["comparisonEligible"] and saved["optiverSummary"]["passed"] is None
    assert saved["events"] == raw
    assert client.get("/api/optiver/analytics").json()["statistics"]["runCount"] == 0


def test_creation_retries_and_filtered_deletion_keep_other_modes(client):
    identity = create(client, creationKey="optiver-retry")
    assert create(client, creationKey="optiver-retry") == identity
    save(client, identity, events())
    standard = create_standard(client)
    trace_standard(client, standard)
    preview = client.get("/api/sessions/deletion-preview?mode=optiver").json()
    assert preview["sessionIds"] == [identity]
    assert client.request("DELETE", "/api/sessions", json={"sessionIds": [identity]}).status_code == 200
    assert client.get("/api/optiver/analytics").json()["savedRunCount"] == 0
    assert client.get(f"/api/sessions/{standard}").status_code == 200
