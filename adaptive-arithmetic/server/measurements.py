"""Response timing v1: derive observations once for reads, results, and exports.

Arithmetic values remain strings. Browser elapsed times remain unrounded floats.
An invalid clock/order taints the affected question and later timings, while raw
events and earlier completed observations remain available for inspection.
"""
import csv
import io
import json
import math
from statistics import mean, median


TIMING_DEFINITIONS = {
    "version": "response-timing-v1",
    "clock": "Monotonic browser performance.now(), relative to the first question's React layout commit; excludes countdown and pending Start.",
    "presentation": "React layout commit: an observable rendering event, not physical screen presentation.",
    "correctAnswerTimeMs": "Answer acceptance elapsedMs minus question presentation elapsedMs; includes input and corrections.",
    "firstInputTimeMs": "First answer-field change elapsedMs minus presentation elapsedMs; includes typing, deletion, and paste.",
    "observedUnfinishedDurationMs": "Last observed elapsedMs minus presentation; a lower bound when the actual end is unknown or the session is ongoing.",
    "summary": "Mean and median of valid correctAnswerTimeMs only; even median averages the two central values; no observations yields null.",
    "nulls": "Unavailable or invalid values are null. In CSV nulls are empty cells; raw input strings are JSON encoded, so an empty input is distinguishable from null.",
    "edits": "Field changes are edits, not incorrect attempts. Neither timing metric is pure calculation speed.",
}


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def derive_session(session):
    """Add derived questions, summary, termination metadata, and quality warnings.

    Does not mutate the stored configuration or raw observations. Legacy records
    may still have usable timings, but are explicitly unversioned. Malformed
    relationships never yield fabricated timing values.
    """
    warnings = []
    questions = []
    by_id = {}
    active = None
    started = None
    terminal = None
    clock_valid = True
    previous_time = 0
    observed = 0
    settings = session["config"].get("session", {})
    try:
        deadline = int(settings["durationSeconds"]) * 1000 if settings.get("format") == "timed" else None
    except (KeyError, ValueError, TypeError):
        deadline = None
        warn_config = True
    else:
        warn_config = False

    def warn(code, message, sequence=None, question=None):
        item = {"code": code, "message": message, "sequence": sequence}
        warnings.append(item)
        if question is not None:
            question["dataQualityWarnings"].append(item)

    if session.get("measurementVersion") is None:
        warn("unversioned-measurement", "This session was recorded by an unversioned client; timing semantics are not certified as response-timing-v1.")
    if warn_config:
        warn("invalid-session-settings", "The original timed duration is not interpretable; inspect the configuration.")

    for index, event in enumerate(session["events"]):
        sequence = event.get("sequence")
        at = event.get("elapsedMs")
        kind = event.get("type")
        payload = event.get("payload")
        if not isinstance(payload, dict):
            payload = {}
            warn("invalid-payload", "An observation has no object payload.", sequence, active)
            clock_valid = False
            if active is not None:
                active["_valid"] = False
        if sequence != index or not number(at) or at < previous_time:
            warn("invalid-event-order", "Observation sequence is incomplete or its elapsed time is invalid/decreases; affected timings are unavailable.", sequence, active)
            clock_valid = False
            if active is not None:
                active["_valid"] = False
        if number(at):
            previous_time = at
            observed = max(observed, at)
        if terminal is not None:
            warn("event-after-end", "An observation follows the terminal event.", sequence, active)
            clock_valid = False
            if active is not None:
                active["_valid"] = False

        beyond_deadline = kind in ("question-presented", "input-changed", "answer-accepted") and number(at) and deadline is not None and at >= deadline
        if beyond_deadline:
            warn("event-at-deadline", "Presentation/input/acceptance occurred at or after the exclusive timed deadline.", sequence, active)
            clock_valid = False
            if active is not None:
                active["_valid"] = False

        if kind == "session-started":
            if started is not None or questions or terminal is not None:
                warn("invalid-start", "Session start is duplicated or follows question/terminal observations.", sequence, active)
                clock_valid = False
                if active is not None:
                    active["_valid"] = False
            else:
                started = event
        elif kind == "question-presented":
            raw = payload.get("question")
            raw = raw if isinstance(raw, dict) else {}
            if active is not None and active["outcome"] == "unfinished":
                warn("unfinished-before-next", "A new question was presented before the preceding question was accepted.", sequence, active)
                active["_valid"] = False
            operation = next((op for op in session["config"].get("operations", []) if op.get("id") == raw.get("operation")), {})
            group = next((g for g in operation.get("groups", []) if g.get("id") == raw.get("groupId")), {})
            question = {
                "id": raw.get("id"), "index": raw.get("index"),
                "presentationSequence": sequence, "operation": raw.get("operation"),
                "operationVersion": operation.get("version"), "groupId": raw.get("groupId"),
                "groupVersion": group.get("version"), "groupName": group.get("name"),
                "left": raw.get("left") if isinstance(raw.get("left"), str) else None,
                "right": raw.get("right") if isinstance(raw.get("right"), str) else None,
                "expected": raw.get("expected") if isinstance(raw.get("expected"), str) else None,
                "selection": raw.get("selection"), "outcome": "unfinished",
                "presentedElapsedMs": at if number(at) else None, "acceptedElapsedMs": None,
                "firstInputElapsedMs": None, "correctAnswerTimeMs": None, "firstInputTimeMs": None,
                "observedUnfinishedDurationMs": None, "unfinishedDurationIsLowerBound": None,
                "acceptedInput": None, "lastInput": None, "inputChangeCount": 0,
                "dataQualityWarnings": [], "_valid": clock_valid and started is not None,
            }
            questions.append(question)
            active = question
            identity = question["id"]
            if not isinstance(identity, str) or not identity:
                warn("missing-question-id", "A presented question has no valid identity.", sequence, question)
                question["_valid"] = False
            elif identity in by_id:
                warn("duplicate-question-id", "Question identity was presented more than once.", sequence, question)
                by_id[identity]["_valid"] = question["_valid"] = False
            else:
                by_id[identity] = question
            if started is None:
                warn("missing-start", "Question was presented without a session-started observation.", sequence, question)
            if not operation or not group or not isinstance(raw.get("selection"), dict):
                warn("incomplete-provenance", "Question provenance is incomplete or not resolved by the original configuration.", sequence, question)
            if any(not isinstance(question[name], str) for name in ("left", "right", "expected")):
                warn("missing-arithmetic", "Exact arithmetic strings are missing from this presentation.", sequence, question)
        elif kind in ("input-changed", "answer-accepted"):
            identity = payload.get("questionId")
            question = by_id.get(identity) if isinstance(identity, str) else None
            if question is None or question is not active or question["outcome"] == "correct":
                warn("invalid-question-reference", "Input/acceptance does not refer to the current unfinished question.", sequence, question)
                if question is not None:
                    question["_valid"] = False
                continue
            question["_valid"] = question["_valid"] and clock_valid
            value = payload.get("value")
            if value is not None and not isinstance(value, str):
                warn("invalid-input-value", "Raw input is not a string; inspect the raw observation.", sequence, question)
                value = None
            if kind == "input-changed":
                question["inputChangeCount"] += 1
                question["lastInput"] = value
                if question["inputChangeCount"] == 1:
                    question["firstInputElapsedMs"] = at if number(at) else None
            else:
                question["outcome"] = "correct"
                question["acceptedElapsedMs"] = at if number(at) else None
                question["acceptedInput"] = value
        elif kind == "session-ended":
            if terminal is None:
                terminal = event
        else:
            warn("unknown-event", "Unrecognized observation type.", sequence, active)
            clock_valid = False
            if active is not None:
                active["_valid"] = False

    end_payload = terminal.get("payload", {}) if terminal else {}
    if not isinstance(end_payload, dict):
        end_payload = {}
    end_known = terminal is not None and end_payload.get("endTimeKnown") is True
    end_at = terminal.get("elapsedMs") if terminal else observed
    if (session["status"] == "ended" and terminal is None) or (session["status"] == "open" and terminal is not None):
        warn("inconsistent-session-state", "Stored session status disagrees with its terminal observations.")
    state = "incomplete" if not terminal and session["status"] == "ended" else "ongoing" if not terminal else "ended" if end_known else "incomplete"
    if not terminal:
        warn("ongoing-session" if state == "ongoing" else "missing-end", "No actual end is recorded; unfinished durations are observed lower bounds.")
    elif not end_known:
        warn("unknown-end-time", "Recovery did not observe the actual end; its wallAt is recovery metadata, and unfinished durations are lower bounds.")

    for question in questions:
        valid = question.pop("_valid")
        presentation = question["presentedElapsedMs"]
        first = question["firstInputElapsedMs"]
        accepted = question["acceptedElapsedMs"]
        if valid and number(presentation):
            if number(first) and first >= presentation:
                question["firstInputTimeMs"] = first - presentation
            if question["outcome"] == "correct" and number(accepted) and accepted >= presentation:
                question["correctAnswerTimeMs"] = accepted - presentation
            elif question["outcome"] == "unfinished" and clock_valid and number(end_at) and end_at >= presentation:
                question["observedUnfinishedDurationMs"] = end_at - presentation
        if question["outcome"] == "unfinished":
            question["unfinishedDurationIsLowerBound"] = not end_known
    values = [q["correctAnswerTimeMs"] for q in questions if q["correctAnswerTimeMs"] is not None]
    summary = {
        "presentedQuestionCount": len(questions),
        "correctQuestionCount": sum(q["outcome"] == "correct" for q in questions),
        "unfinishedQuestionCount": sum(q["outcome"] == "unfinished" for q in questions),
        "validCorrectAnswerCount": len(values),
        "medianCorrectAnswerTimeMs": median(values) if values else None,
        "meanCorrectAnswerTimeMs": mean(values) if values else None,
    }
    start_payload = started.get("payload") if started else None
    return {**session, "terminationState": state, "terminationReason": end_payload.get("reason"),
            "startedAt": start_payload.get("wallAt") if isinstance(start_payload, dict) else None,
            "endedAt": end_payload.get("wallAt") if end_known else None,
            "endTimeKnown": end_known, "observedDurationMs": observed if clock_valid else None,
            "questions": questions, "summary": summary, "dataQualityWarnings": warnings}


CSV_FIELDS = [
    "sessionId", "createdAt", "startedAt", "endedAt", "status", "terminationState", "terminationReason", "endTimeKnown",
    "sessionFormat", "durationSeconds", "countdown", "measurementVersion", "seed", "generatorVersion", "policyVersion",
    "questionId", "questionIndex", "presentationSequence", "operation", "operationVersion", "groupId", "groupVersion", "groupName",
    "left", "right", "expected", "outcome", "presentedElapsedMs", "firstInputElapsedMs", "acceptedElapsedMs",
    "correctAnswerTimeMs", "firstInputTimeMs", "observedUnfinishedDurationMs", "unfinishedDurationIsLowerBound", "inputChangeCount",
    "acceptedInputJson", "lastInputJson", "selectionJson", "dataQualityWarningsJson", "configJson",
]


def json_text(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def export_csv(sessions):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, CSV_FIELDS, lineterminator="\r\n")
    writer.writeheader()
    for session in sessions:
        for question in session["questions"]:
            row = {key: session.get(key) for key in CSV_FIELDS if key in session}
            row.update({key: value for key, value in question.items() if key in CSV_FIELDS})
            row.update(session["config"].get("session", {}))
            row.pop("format", None)
            row.update(sessionId=session["id"], sessionFormat=session["config"]["session"]["format"],
                       questionId=question["id"], questionIndex=question["index"],
                       acceptedInputJson=json_text(question["acceptedInput"]) if question["acceptedInput"] is not None else None,
                       lastInputJson=json_text(question["lastInput"]) if question["lastInput"] is not None else None,
                       selectionJson=json_text(question["selection"]) if question["selection"] is not None else None,
                       dataQualityWarningsJson=json_text(session["dataQualityWarnings"]), configJson=json_text(session["config"]))
            writer.writerow({key: "true" if value is True else "false" if value is False else value for key, value in row.items()})
    return stream.getvalue()
