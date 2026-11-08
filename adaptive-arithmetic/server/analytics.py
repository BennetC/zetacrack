"""Descriptive Stage 1 analytics over the sole observation derivation.

Names and group IDs deliberately remain part of cohort identity. This conservative
canonicalization never pools renamed or superficially similar historical content.
"""
from collections import Counter
from bisect import bisect_right
from decimal import InvalidOperation
from server.decimal_input import exact
import hashlib
import json
from statistics import mean, median
from server.run_analytics import describe_run

STANDARD_CONTENT = "zetamac-default-v1"
STANDARD_GENERATOR = "zetamac-reverse-v1"
STANDARD_POLICY = "equal-operations-v1"
CUSTOM_CONTENT = "custom-grid-v1"


def standard_config():
    operations = []
    for operation in ("addition", "subtraction", "multiplication", "division"):
        product = operation in ("multiplication", "division")
        operations.append({"id": operation, "version": 1, "share": "25", "groups": [{
            "id": "standard-" + operation, "version": 1, "name": "Standard " + operation,
            "share": "100", "first": {"min": "2", "max": "12" if product else "100", "decimalPlaces": 0},
            "second": {"min": "2", "max": "100", "decimalPlaces": 0}, "allowNegative": False,
        }]})
    return {"version": 1, "operations": operations, "session": {"format": "timed", "durationSeconds": "120", "countdown": False}}


def aggregate(questions):
    times = [q["correctAnswerTimeMs"] for q in questions if q["correctAnswerTimeMs"] is not None]
    return {"presentedQuestionCount": len(questions), "correctQuestionCount": sum(q["outcome"] == "correct" for q in questions),
            "unfinishedQuestionCount": sum(q["outcome"] == "unfinished" for q in questions), "validCorrectAnswerCount": len(times),
            "medianCorrectAnswerTimeMs": median(times) if times else None, "meanCorrectAnswerTimeMs": mean(times) if times else None}


def enrich(session, detailed=True):
    """Add comparison provenance/eligibility; never rewrite old observations."""
    mode = session.get("mode")
    identity = {key: session.get(key) for key in ("mode", "contentVersion", "generatorVersion", "policyVersion", "measurementVersion")}
    identity["config"] = session["config"]
    if session.get("replayOf"):
        identity["challenge"] = True
    key = hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    reasons = []
    if session.get("replayOf"):
        reasons.append("Repeated-seed challenge; excluded from benchmark comparisons")
    if mode not in ("standard", "custom") or session.get("contentVersion") is None:
        reasons.append("Unversioned mode/content provenance")
    if session.get("measurementVersion") != "response-timing-v1":
        reasons.append("Unversioned timing semantics")
    if session["terminationState"] != "ended" or not session["endTimeKnown"]:
        reasons.append("Ongoing or unknown actual end")
    if session["terminationReason"] != "timeout" or session["config"].get("session", {}).get("format") != "timed":
        reasons.append("Interrupted or untimed run")
    state_warnings = {"unversioned-measurement", "ongoing-session", "unknown-end-time"}
    material_warnings = [w for w in session["dataQualityWarnings"] if w["code"] not in state_warnings]
    if material_warnings:
        reasons.append("Inconsistent observations")
    end = next((e for e in session["events"] if e.get("type") == "session-ended"), None)
    start = next((e for e in session["events"] if e.get("type") == "session-started"), None)
    try:
        expected_end = int(session["config"]["session"]["durationSeconds"]) * 1000
        if end is None or end.get("elapsedMs") != expected_end or start is None or start.get("elapsedMs") != 0:
            reasons.append("Run did not record its full fixed duration")
    except (ValueError, TypeError, KeyError):
        reasons.append("Invalid fixed duration")
    if not session["questions"]:
        reasons.append("No presented questions")
    if session["summary"]["correctQuestionCount"] != session["summary"]["validCorrectAnswerCount"]:
        reasons.append("Invalid accepted-answer timing")
    content_ok = True
    for q in session["questions"]:
        try:
            left, right, expected = (exact(q[k]) for k in ("left", "right", "expected"))
            operation = q["operation"]
            calculated = left + right if operation == "addition" else left - right if operation == "subtraction" else left * right if operation == "multiplication" else left / right if operation == "division" else None
            if calculated != expected:
                content_ok = False
            if q["outcome"] == "correct" and exact(q["acceptedInput"]) != expected:
                content_ok = False
            if mode == "standard":
                a, b = (left, right) if operation in ("addition", "multiplication") else (right, expected)
                maximum = 100 if operation in ("addition", "subtraction") else 12
                if a.denominator != 1 or b.denominator != 1 or not 2 <= a <= maximum or not 2 <= b <= 100 or q["groupId"] != "standard-" + operation:
                    content_ok = False
                selection = q.get("selection") or {}
                pair_count = "9801" if operation in ("addition", "subtraction") else "1089"
                if not isinstance(selection, dict) or selection.get("operationBasisPoints") != 2500 or selection.get("groupBasisPoints") != 10000 or selection.get("validPairCount") != pair_count:
                    content_ok = False
        except (InvalidOperation, TypeError, ValueError, ArithmeticError):
            content_ok = False
    if mode == "standard" and (session["config"] != standard_config() or session.get("contentVersion") != STANDARD_CONTENT or session["generatorVersion"] != STANDARD_GENERATOR or session["policyVersion"] != STANDARD_POLICY):
        content_ok = False
    if not content_ok:
        reasons.append("Arithmetic/input or standard-content trace is inconsistent")
        session["dataQualityWarnings"].append({"code": "invalid-content-trace", "message": "Arithmetic, accepted input, or standard provenance is inconsistent; this run is excluded from full-run comparisons.", "sequence": None})
    settings = session["config"].get("session", {})
    title = "Standard Zetamac" if mode == "standard" else "Custom practice" if mode == "custom" else "Legacy / unspecified mode"
    operation_names = ", ".join(op["id"] for op in session["config"].get("operations", []) if op.get("share") != "0")
    duration = f'{settings.get("durationSeconds")} seconds' if settings.get("format") == "timed" else "endless"
    session.update(cohortKey=key, cohortLabel=f"{title} · {duration} · {operation_names} · {key[:8]}",
                   score=session["summary"]["correctQuestionCount"], comparisonEligible=not reasons,
                   comparisonExclusionReasons=list(dict.fromkeys(reasons)), scoreState="full" if not reasons else "partial")
    if detailed:
        session = add_details(session)
    return session


def add_details(session):
    """Build replay and single-run charts only when their consumer needs them."""
    return {**session, "runAnalytics": describe_run(session),
            "analysis": analytics([session], session["cohortKey"], include_partial=True)}


def filter_sessions(sessions, mode=None, status=None, after=None, before=None, configuration=None):
    def matches(s):
        date = s["createdAt"][:10]
        return ((mode is None or (s.get("mode") or "legacy") == mode) and
                (status is None or s["terminationState"] == status) and
                (after is None or date >= after) and (before is None or date <= before) and
                (not configuration or configuration.casefold() in json.dumps(s["config"], ensure_ascii=False).casefold()))
    return sorted(filter(matches, sessions), key=lambda s: (s["createdAt"], s["id"]), reverse=True)


def histogram(values):
    """Ten equal-width bins; [lower, upper), final upper included. Zero valid."""
    if not values:
        return []
    low, high = min(values), max(values)
    if low == high:
        return [{"lowerMs": low, "upperMs": high, "upperInclusive": True, "count": len(values)}]
    width = (high - low) / 10
    edges = [low + i * width for i in range(10)] + [high]
    counts = [0] * 10
    for value in values:
        counts[min(9, bisect_right(edges, value) - 1)] += 1
    return [{"lowerMs": edges[i], "upperMs": edges[i + 1],
             "upperInclusive": i == 9, "count": count} for i, count in enumerate(counts)]


def analytics(sessions, cohort=None, include_partial=False):
    cohorts = {}
    for session in sessions:
        entry = cohorts.setdefault(session["cohortKey"], {"key": session["cohortKey"], "label": session["cohortLabel"], "mode": session.get("mode"), "sessionCount": 0, "eligibleSessionCount": 0})
        entry["sessionCount"] += 1
        entry["eligibleSessionCount"] += session["comparisonEligible"]
    choices = list(cohorts.values())
    if cohort is None:
        cohort = next((c["key"] for c in choices if c["mode"] == "standard" and c["eligibleSessionCount"]), choices[0]["key"] if choices else None)
    selected = [s for s in sessions if s["cohortKey"] == cohort]
    eligible = sorted((s for s in selected if s["comparisonEligible"]), key=lambda s: (s["createdAt"], s["id"]), reverse=True)
    scores = [s["score"] for s in eligible]
    recent_scores = scores[:10]
    previous_scores = scores[10:20]
    timed_runs = [s["summary"] for s in eligible if s["summary"]["validCorrectAnswerCount"] > 0]
    run_means = [s["meanCorrectAnswerTimeMs"] for s in timed_runs]
    run_medians = [s["medianCorrectAnswerTimeMs"] for s in timed_runs]
    full_run_statistics = {
        "runCount": len(eligible),
        "meanScore": mean(scores) if scores else None,
        "medianScore": median(scores) if scores else None,
        "bestScore": max(scores) if scores else None,
        "recentRunCount": len(recent_scores),
        "recentMeanScore": mean(recent_scores) if recent_scores else None,
        "previousRunCount": len(previous_scores),
        "previousMeanScore": mean(previous_scores) if previous_scores else None,
        "recentScoreDifference": mean(recent_scores) - mean(previous_scores) if recent_scores and previous_scores else None,
        "answerSummary": aggregate([q for s in eligible for q in s["questions"]]),
        "runTiming": {
            "contributingRunCount": len(timed_runs),
            "meanRunMeanMs": mean(run_means) if run_means else None,
            "medianRunMeanMs": median(run_means) if run_means else None,
            "meanRunMedianMs": mean(run_medians) if run_medians else None,
            "medianRunMedianMs": median(run_medians) if run_medians else None,
        },
    }
    observations = selected if include_partial else eligible
    questions = [q for s in observations for q in s["questions"]]
    values = [q["correctAnswerTimeMs"] for q in questions if q["correctAnswerTimeMs"] is not None]
    breakdown = []
    for level in ("operation", "group"):
        grouped = {}
        for q in questions:
            group_key = (q.get("operation"), q.get("groupId")) if level == "group" else (q.get("operation"),)
            grouped.setdefault(group_key, []).append(q)
        for group_key, records in grouped.items():
            label = (records[0].get("groupName") or "Unknown group") if level == "group" else (group_key[0] or "Unknown operation")
            breakdown.append({"level": level, "operation": group_key[0], "groupId": group_key[1] if level == "group" else None, "label": label, **aggregate(records)})
    reasons = Counter(reason for s in selected if not s["comparisonEligible"] for reason in s["comparisonExclusionReasons"])
    return {"totalSavedSessionCount": len(sessions), "cohorts": choices, "selectedCohortKey": cohort, "selectedSessionCount": len(selected), "eligibleSessionCount": len(eligible),
            "excludedSessionCount": len(selected) - len(eligible), "exclusionReasons": dict(reasons), "includePartialObservations": include_partial,
            "observationSessionCount": len(observations), "summary": aggregate(questions), "fullRunStatistics": full_run_statistics, "histogram": histogram(values), "breakdown": breakdown,
            "trend": [{"sessionId": s["id"], "createdAt": s["createdAt"], "score": s["score"], **s["summary"]} for s in reversed(eligible)],
            "sessions": [{"id": s["id"], "createdAt": s["createdAt"], "scoreState": s["scoreState"]} for s in observations]}
