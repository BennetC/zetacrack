"""Optiver-style choice tests: exact rational answers and isolated analytics.

The public QuantPrep trial supplies the 80-position question-family profile.
Fresh operands/options are our versioned generator, not Optiver's question bank.
"""
import hashlib
import json
import math
import re
from fractions import Fraction
from pathlib import Path
from statistics import mean, median
from server.decimal_input import exact

CONTENT = "optiver-80-in-8-v1"
GENERATOR = "optiver-rational-v1"
POLICY = "optiver-profile-v1"
MEASUREMENT = "choice-response-v1"
COUNT, DEADLINE, PASS = 80, 480000, 56
CHOICE_TIMING_DEFINITIONS = {
    "version": MEASUREMENT,
    "clock": "Monotonic browser performance.now(), relative to first question layout commit; the clock continues through focus loss and 100ms choice feedback.",
    "presentation": "React layout commit, not physical screen presentation.",
    "responseTimeMs": "Valid answer-submitted elapsedMs minus question presentation elapsedMs, for both correct and incorrect choices; includes reading and choosing.",
    "correctAnswerTimeMs": "responseTimeMs for correct choices only; incorrect choices are not correct-time samples.",
    "firstInputTimeMs": "Null: this is a choice test with no typed-answer field.",
    "score": "Correct choices minus incorrect choices. All remaining questions up to 80 score zero. Practice target: 56, taken from QuantPrep, not an official hiring cutoff.",
    "completion": "80 choices before the exclusive 480000ms deadline, or timeout at exactly 480000ms. Interrupted, invalid and repeated-seed runs are excluded from benchmark metrics.",
    "nulls": "Unavailable or invalid values are null; CSV uses empty cells. Choice strings and original equations/options are preserved.",
}
PROFILES = json.loads((Path(__file__).resolve().parent.parent / "shared/optiver-profile.json").read_text(encoding="utf-8"))


def optiver_config():
    return {"version": 1, "operations": [{"id": op, "version": 1, "share": "25", "groups": [{
        "id": "optiver-" + op, "version": 1, "name": "Optiver " + op, "share": "100",
        "first": {"min": "0", "max": "999", "decimalPlaces": 3},
        "second": {"min": "0", "max": "999", "decimalPlaces": 3}, "allowNegative": False,
    }]} for op in ("addition", "subtraction", "multiplication", "division")],
        "session": {"format": "timed", "durationSeconds": "480", "countdown": False}}


def value(text):
    if not isinstance(text, str):
        raise ValueError("Missing rational string")
    mixed = re.fullmatch(r"(-?)([0-9]+) ([0-9]+)/([0-9]+)", text)
    if mixed:
        sign, whole, numerator, denominator = mixed.groups()
        return (int(whole) + Fraction(int(numerator), int(denominator))) * (-1 if sign else 1)
    fraction = re.fullmatch(r"(-?[0-9]+)/([0-9]+)", text)
    return Fraction(int(fraction[1]), int(fraction[2])) if fraction else exact(text)


def trace_valid(q, index):
    try:
        if type(q["index"]) is not int or q["index"] != index or not 0 <= index < COUNT or q["id"] != f"q-{index}":
            return False
        profile, data = PROFILES[index], q["optiver"]
        if (q["operation"] != profile["operation"] or q["groupId"] != "optiver-" + q["operation"] or
                data["kind"] != profile["kind"] or data["blank"] != profile["blank"] or type(data["profileIndex"]) is not int or data["profileIndex"] != index):
            return False
        a, b, c, expected = value(q["left"]), value(q["right"]), value(data["result"]), value(q["expected"])
        calculated = a + b if q["operation"] == "addition" else a - b if q["operation"] == "subtraction" else a * b if q["operation"] == "multiplication" else a / b
        unknown = {"left": a, "right": b, "result": c}[data["blank"]]
        options = data["options"]
        return (a > 0 and b > 0 and c > 0 and calculated == c and unknown == expected and
                isinstance(options, list) and len(options) == 4 and len(set(map(value, options))) == 4 and
                sum(value(option) == expected for option in options) == 1 and
                q.get("selection") == {"operationBasisPoints": None, "groupBasisPoints": None, "validPairCount": None})
    except (KeyError, TypeError, ValueError, ArithmeticError):
        return False


def number(n):
    return type(n) in (int, float) and math.isfinite(n) and n >= 0


def derive_optiver(session):
    questions, warnings, seen = [], [], set()
    started = terminal = active = None
    previous = observed = 0
    clock_valid = True

    def warn(code, message, sequence=None, q=None):
        item = {"code": code, "message": message, "sequence": sequence}
        warnings.append(item)
        if q is not None:
            q["dataQualityWarnings"].append(item)
            q["_valid"] = False

    for index, event in enumerate(session["events"]):
        seq, at, kind, payload = (event.get(k) for k in ("sequence", "elapsedMs", "type", "payload"))
        if not isinstance(payload, dict):
            payload = {}
            clock_valid = False
            warn("invalid-payload", "Observation payload is not an object.", seq, active)
        if type(seq) is not int or seq != index or not number(at) or at < previous or terminal is not None:
            clock_valid = False
            warn("invalid-event-order", "Invalid order, clock, or observation after the end; affected timings are excluded.", seq, active)
        if number(at):
            previous, observed = at, max(observed, at)
        if kind in ("question-presented", "answer-submitted") and number(at) and at >= DEADLINE:
            clock_valid = False
            warn("event-at-deadline", "Choice or presentation occurred at/after the exclusive eight-minute deadline.", seq, active)
        if kind == "session-started":
            if started is not None or questions or terminal is not None or at != 0:
                clock_valid = False
                warn("invalid-start", "The test must start once, at elapsed zero, before its questions.", seq, active)
            else:
                started = event
        elif kind == "question-presented":
            raw = payload.get("question")
            raw = raw if isinstance(raw, dict) else {}
            if active is not None:
                clock_valid = False
                warn("unfinished-before-next", "The previous question has no choice submission.", seq, active)
            op = raw.get("operation")
            q = {"id": raw.get("id"), "index": raw.get("index"), "presentationSequence": seq,
                 "operation": op, "operationVersion": 1, "groupId": raw.get("groupId"), "groupVersion": 1,
                 "groupName": "Optiver " + op if isinstance(op, str) else None,
                 "left": raw.get("left"), "right": raw.get("right"), "expected": raw.get("expected"),
                 "selection": raw.get("selection"), "optiver": raw.get("optiver"), "outcome": "unfinished",
                 "presentedElapsedMs": at if number(at) else None, "acceptedElapsedMs": None,
                 "firstInputElapsedMs": None, "firstInputTimeMs": None, "correctAnswerTimeMs": None,
                 "responseTimeMs": None, "observedUnfinishedDurationMs": None, "unfinishedDurationIsLowerBound": None,
                 "acceptedInput": None, "lastInput": None, "selectedOptionIndex": None,
                 "inputChangeCount": 0, "dataQualityWarnings": [], "_valid": clock_valid and started is not None}
            if not trace_valid(raw, len(questions)) or raw.get("id") in seen:
                warn("invalid-optiver-content", "Equation, choices, question order, or profile does not match this versioned paper.", seq, q)
            if started is None:
                warn("missing-start", "No test start was recorded.", seq, q)
            if isinstance(raw.get("id"), str):
                seen.add(raw["id"])
            questions.append(q)
            active = q
        elif kind == "answer-submitted":
            if active is None or payload.get("questionId") != active["id"]:
                clock_valid = False
                warn("invalid-question-reference", "Submission does not refer to the current unanswered question.", seq, active)
                continue
            option, selected = payload.get("optionIndex"), payload.get("value")
            data = active.get("optiver")
            options = data.get("options") if isinstance(data, dict) else None
            if (type(option) is not int or not 0 <= option < 4 or not isinstance(options, list) or
                    len(options) != 4 or selected != options[option]):
                warn("invalid-choice", "Selected value/index does not match a displayed option.", seq, active)
                continue
            try:
                correct = value(selected) == value(active["expected"])
            except (TypeError, ValueError, ArithmeticError):
                warn("invalid-choice", "The selected value or expected value is not an exact rational.", seq, active)
                continue
            active.update(outcome="correct" if correct else "incorrect", acceptedInput=selected, lastInput=selected,
                          selectedOptionIndex=option, acceptedElapsedMs=at if number(at) else None)
            presentation = active["presentedElapsedMs"]
            if active["_valid"] and clock_valid and number(at) and number(presentation) and at >= presentation:
                active["responseTimeMs"] = at - presentation
                if correct:
                    active["correctAnswerTimeMs"] = at - presentation
            active = None
        elif kind == "session-ended":
            if terminal is None:
                terminal = event
        else:
            clock_valid = False
            warn("unknown-event", "This mode accepts choice submissions, not typed answer events.", seq, active)

    end_payload = terminal.get("payload", {}) if terminal else {}
    end_payload = end_payload if isinstance(end_payload, dict) else {}
    known = terminal is not None and end_payload.get("endTimeKnown") is True
    if (session["status"] == "ended") != (terminal is not None):
        warn("inconsistent-session-state", "Stored session status disagrees with its terminal observation.")
    if terminal is None:
        warn("ongoing-session", "The actual end is not yet recorded.")
    elif not known:
        warn("unknown-end-time", "Recovery did not observe the actual end.")
    for q in questions:
        valid = q.pop("_valid")
        if q["outcome"] == "unfinished":
            end_at = terminal.get("elapsedMs") if terminal else observed
            if valid and clock_valid and number(end_at) and number(q["presentedElapsedMs"]) and end_at >= q["presentedElapsedMs"]:
                q["observedUnfinishedDurationMs"] = end_at - q["presentedElapsedMs"]
            q["unfinishedDurationIsLowerBound"] = not known
    times = [q["correctAnswerTimeMs"] for q in questions if q["correctAnswerTimeMs"] is not None]
    correct = sum(q["outcome"] == "correct" for q in questions)
    incorrect = sum(q["outcome"] == "incorrect" for q in questions)
    responses = [q["responseTimeMs"] for q in questions if q["responseTimeMs"] is not None]
    return {**session, "questions": questions, "dataQualityWarnings": warnings,
            "terminationState": "ended" if known else "incomplete" if terminal or session["status"] == "ended" else "ongoing",
            "terminationReason": end_payload.get("reason"), "startedAt": started["payload"].get("wallAt") if started else None,
            "endedAt": end_payload.get("wallAt") if known else None, "endTimeKnown": known,
            "observedDurationMs": observed if clock_valid else None,
            "summary": {"presentedQuestionCount": len(questions), "correctQuestionCount": correct,
                        "unfinishedQuestionCount": sum(q["outcome"] == "unfinished" for q in questions),
                        "validCorrectAnswerCount": len(times), "meanCorrectAnswerTimeMs": mean(times) if times else None,
                        "medianCorrectAnswerTimeMs": median(times) if times else None},
            "optiverSummary": {"totalQuestions": COUNT, "attempted": correct + incorrect, "correct": correct, "incorrect": incorrect,
                               "unanswered": COUNT - correct - incorrect, "netScore": correct - incorrect,
                               "accuracy": correct / (correct + incorrect) if correct + incorrect else None,
                               "meanResponseTimeMs": mean(responses) if responses else None,
                               "medianResponseTimeMs": median(responses) if responses else None,
                               "validResponseCount": len(responses), "practicePassMark": PASS}}


def enrich_optiver(session):
    identity = {k: session.get(k) for k in ("mode", "contentVersion", "generatorVersion", "policyVersion", "measurementVersion", "config")}
    if session.get("replayOf"):
        identity["challenge"] = True
    key = hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    reasons = []
    if session.get("replayOf"):
        reasons.append("Repeated-seed challenge; excluded from benchmark comparisons")
    if (session.get("config") != optiver_config() or session.get("generatorVersion") != GENERATOR or
            session.get("policyVersion") != POLICY or session.get("contentVersion") != CONTENT or session.get("measurementVersion") != MEASUREMENT):
        reasons.append("Invalid Optiver rules or provenance")
    if session["terminationState"] != "ended" or not session["endTimeKnown"]:
        reasons.append("Ongoing or unknown actual end")
    end = next((e for e in session["events"] if e.get("type") == "session-ended"), None)
    attempted = session["optiverSummary"]["attempted"]
    reason = session["terminationReason"]
    complete = end is not None and ((reason == "timeout" and end.get("elapsedMs") == DEADLINE) or
                                   (reason == "completed" and attempted == COUNT and number(end.get("elapsedMs")) and end["elapsedMs"] < DEADLINE))
    if not complete:
        reasons.append("Interrupted or incomplete test")
    if session["dataQualityWarnings"]:
        reasons.append("Inconsistent or incomplete observations")
    if not session["questions"]:
        reasons.append("No presented questions")
    if attempted != session["optiverSummary"]["validResponseCount"]:
        reasons.append("Invalid choice-response timing")
    session.update(cohortKey=key, cohortLabel=f"Optiver 80 in 8 · 480 seconds · {key[:8]}",
                   score=session["optiverSummary"]["netScore"], comparisonEligible=not reasons,
                   comparisonExclusionReasons=reasons, scoreState="full" if not reasons else "partial")
    session["optiverSummary"]["passed"] = session["score"] >= PASS if not reasons else None
    return session


def choice_stats(questions):
    correct = sum(q["outcome"] == "correct" for q in questions)
    incorrect = sum(q["outcome"] == "incorrect" for q in questions)
    times = [q["responseTimeMs"] for q in questions if q["responseTimeMs"] is not None]
    return {"attempted": correct + incorrect, "correct": correct, "incorrect": incorrect, "netScore": correct - incorrect,
            "accuracy": correct / (correct + incorrect) if correct + incorrect else None,
            "meanResponseTimeMs": mean(times) if times else None, "medianResponseTimeMs": median(times) if times else None,
            "validResponseCount": len(times)}


def optiver_statistics(sessions):
    full = [s for s in sessions if s["comparisonEligible"]]
    qs = [q for s in full for q in s["questions"]]
    breakdown = []
    for level, labels in (("operation", ("addition", "subtraction", "multiplication", "division")),
                          ("kind", ("integer", "decimal", "fraction")), ("blank", ("left", "right", "result"))):
        for label in labels:
            selected = [q for q in qs if (q["operation"] if level == "operation" else q["optiver"][level]) == label]
            breakdown.append({"level": level, "label": label, **choice_stats(selected)})
    pace = []
    for minute in range(8):
        selected = [q for q in qs if q["acceptedElapsedMs"] is not None and minute * 60000 <= q["acceptedElapsedMs"] < (minute + 1) * 60000]
        pace.append({"minute": minute + 1, **choice_stats(selected)})
    passed = sum(s["score"] >= PASS for s in full)
    scores = [s["score"] for s in full]
    return {**choice_stats(qs), "runCount": len(full), "passedRuns": passed, "passRate": passed / len(full) if full else None,
            "bestScore": max(scores) if scores else None, "meanScore": mean(scores) if scores else None,
            "unanswered": sum(s["optiverSummary"]["unanswered"] for s in full), "breakdown": breakdown, "pace": pace,
            "practicePassMark": PASS}
