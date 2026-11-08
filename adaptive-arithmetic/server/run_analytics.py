"""Versioned descriptive views of immutable arithmetic interactions.

Edit hypotheses describe string patterns, never a diagnosis of cognitive intent.
All time calculations consume the existing validated measurement intervals.
"""
from collections import defaultdict
from statistics import median
from math import ceil
from server.measurements import number


VERSION = "run-explorer-v1"


def difference(before, after):
    """Minimal contiguous replacement; counts characters, not physical keys."""
    start = 0
    while start < min(len(before), len(after)) and before[start] == after[start]:
        start += 1
    end = 0
    while end < min(len(before), len(after)) - start and before[-end - 1] == after[-end - 1]:
        end += 1
    return before[start:len(before) - end if end else None], after[start:len(after) - end if end else None], start


def characteristics(q):
    features = ["operation: " + (q.get("operation") or "unknown")]
    left, right, answer = (q.get(k) or "" for k in ("left", "right", "expected"))
    features.append(f"answer length: {len(answer.lstrip('+-').replace('.', ''))} digits")
    features.append("decimal: " + ("yes" if any("." in v for v in (left, right, answer)) else "no"))
    features.append("negative: " + ("yes" if any(v.startswith("-") for v in (left, right, answer)) else "no"))
    features.append(f"operand size: {max(len(v.lstrip('+-').split('.')[0]) for v in (left, right))} digits")
    if q.get("operation") in ("addition", "subtraction") and left.isascii() and right.isascii() and left.isdigit() and right.isdigit():
        a, b = left.zfill(max(len(left), len(right))), right.zfill(max(len(left), len(right)))
        carry, occurs = 0, False
        for x, y in zip(reversed(a), reversed(b)):
            carry = int(int(x) + int(y) + carry >= 10) if q["operation"] == "addition" else int(int(x) - carry < int(y))
            occurs |= bool(carry)
        features.append(("carrying: " if q["operation"] == "addition" else "borrowing: ") + ("yes" if occurs else "no"))
    if q.get("operation") == "multiplication":
        features.append(f"multiplication fact: {left} × {right}")
    return features


def describe_run(session):
    raw = session["events"]
    presentations = [i for i, e in enumerate(raw) if e.get("type") == "question-presented"]
    records = []
    previous = None
    for i, q in enumerate(session["questions"]):
        start_sequence = presentations[i]
        stop = presentations[i + 1] if i + 1 < len(presentations) else len(raw)
        interval = []
        for e in raw[start_sequence + 1:stop]:
            if e.get("type") == "session-ended" or (e.get("type") == "answer-accepted" and isinstance(e.get("payload"), dict) and e["payload"].get("questionId") == q["id"]):
                break
            interval.append(e)
        changes = [e for e in interval if e.get("type") == "input-changed" and isinstance(e.get("payload"), dict) and e["payload"].get("questionId") == q["id"] and isinstance(e["payload"].get("value"), str)]
        composing = any(e["payload"].get("isComposing") is True for e in changes)
        valid = q["correctAnswerTimeMs"] is not None or q["observedUnfinishedDurationMs"] is not None
        before, inserted, removed, episodes, revising = "", 0, 0, 0, False
        frames, positions, hypotheses, digit_edits = [], [], [], []
        last_at, revision_start = None, None
        for e in changes:
            p, at = e["payload"], e["elapsedMs"]
            value = p["value"]
            deleted, added, position = difference(before, value)
            revision = bool(deleted)
            inserted += len(added)
            removed += len(deleted)
            if revision:
                positions.append(position + 1)
                digit_edits.extend(c for c in deleted if c in "0123456789")
                if not revising:
                    episodes += 1
                    if revision_start is None and valid and number(at):
                        revision_start = at
                # Pattern-only rules. Threshold is disclosed in the UI/contract.
                if not composing and number(last_at) and number(at) and 0 <= at - last_at <= 600 and len(before) == len(q.get("expected") or ""):
                    expected = q.get("expected") or ""
                    diffs = [j for j, (a, b) in enumerate(zip(before, expected)) if a != b]
                    if len(diffs) == 2 and before[diffs[0]] == expected[diffs[1]] and before[diffs[1]] == expected[diffs[0]]:
                        hypotheses.append("possible transposition")
                    elif len(diffs) == 1:
                        hypotheses.append("possible mistype")
            frames.append({"sequence": e["sequence"], "value": value, "atMs": at - q["presentedElapsedMs"] if valid and number(at) and number(q["presentedElapsedMs"]) else None, "inputType": p.get("inputType") if isinstance(p.get("inputType"), str) else "unknown", "revision": revision})
            before, last_at, revising = value, at, revision
        total = q["correctAnswerTimeMs"]
        first = q["firstInputTimeMs"]
        post = total - first if total is not None and first is not None else None
        window = [r["totalMs"] for r in records[-4:] if r["totalMs"] is not None] + ([total] if total is not None else [])
        record = {"index": i + 1, "id": q["id"], "presentationSequence": start_sequence,
                  "operation": q["operation"], "groupId": q["groupId"], "left": q["left"], "right": q["right"], "expected": q["expected"], "outcome": q["outcome"],
                  "presentedMs": q["presentedElapsedMs"] if valid else None, "acceptedMs": q["acceptedElapsedMs"] if total is not None else None,
                  "totalMs": total, "firstMs": first, "entryMs": post,
                  "unfinishedMs": q["observedUnfinishedDurationMs"], "lowerBound": q["unfinishedDurationIsLowerBound"],
                  "deltaMs": total - previous["totalMs"] if total is not None and previous and previous["totalMs"] is not None else None,
                  "rollingMedianMs": median(window) if window and total is not None else None,
                  "inputChanges": len(changes), "charactersInserted": inserted, "charactersRemoved": removed, "revisionEpisodes": episodes,
                  "revisionToAcceptanceMs": q["acceptedElapsedMs"] - revision_start if revision_start is not None and total is not None else None,
                  "editPositions": positions, "removedDigits": digit_edits,
                  "hypothesis": next(iter(hypotheses), "unknown" if episodes else "no revision observed"),
                  "telemetry": "answer-edits-v2" if changes and all(e["payload"].get("telemetryVersion") == "answer-edits-v2" for e in changes) else "field-changes-v1",
                  "frames": frames, "features": characteristics(q),
                  "maxPauseMs": max([frames[j]["atMs"] - frames[j - 1]["atMs"] for j in range(1, len(frames)) if frames[j]["atMs"] is not None and frames[j - 1]["atMs"] is not None] or [0]) if valid and len(frames) >= 2 else None}
        record["features"].append("transition: " + ("first question" if previous is None else "repeat operation" if previous["operation"] == record["operation"] else "switch operation"))
        if previous:
            record["features"].append(f"after operation: {previous['operation']} → {record['operation']}")
        record["features"].extend(f"removed digit: {digit}" for digit in sorted(set(digit_edits)))
        record["features"].extend(f"revision position: {position}" for position in sorted(set(positions)))
        records.append(record)
        previous = record
    completed = [r for r in records if r["totalMs"] is not None]
    values = [r["totalMs"] for r in completed]
    duration = session.get("observedDurationMs")
    splits = []
    # Bound chart output for very long endless sessions without dropping time.
    width = max(15000, ((int(duration or 0) // 200 // 15000) + 1) * 15000)
    if number(duration):
        for start in range(0, max(1, ceil(duration)), width):
            end = min(start + width, duration)
            included = [r for r in completed if start <= r["acceptedMs"] < end or (r["acceptedMs"] == end == duration)]
            samples = [r["totalMs"] for r in included]
            splits.append({"startMs": start, "endMs": end, "count": len(included), "medianMs": median(samples) if samples else None, "revised": sum(r["revisionEpisodes"] > 0 for r in included), "indices": [r["index"] for r in included]})
    revised = [r for r in records if r["revisionEpisodes"]]
    summary = {"completed": len(completed), "withInput": sum(bool(r["frames"]) for r in records), "revisedCompleted": sum(r["revisionEpisodes"] > 0 for r in completed),
               "revisedUnfinished": sum(r["revisionEpisodes"] > 0 and r["outcome"] == "unfinished" for r in records), "revisionEpisodes": sum(r["revisionEpisodes"] for r in records),
               "charactersRemoved": sum(r["charactersRemoved"] for r in records), "charactersInserted": sum(r["charactersInserted"] for r in records),
               "medianMs": median(values) if values else None, "p90Ms": sorted(values)[max(0, (9 * len(values) + 9) // 10 - 1)] if values else None,
               "iqrMs": (sorted(values)[3 * (len(values) - 1) // 4] - sorted(values)[(len(values) - 1) // 4]) if values else None,
               "slowestFiveShare": sum(sorted(values, reverse=True)[:5]) / duration if duration and values else None}
    before = sum(r["firstMs"] or 0 for r in completed)
    after_clean = sum(r["entryMs"] or 0 for r in completed if not r["revisionEpisodes"])
    after_revised = sum(r["entryMs"] or 0 for r in completed if r["revisionEpisodes"])
    unpartitioned = sum(r["totalMs"] for r in completed if r["firstMs"] is None)
    unfinished = sum(r["unfinishedMs"] or 0 for r in records)
    accounted = before + after_clean + after_revised + unpartitioned + unfinished
    breakdown = [{"label": label, "ms": ms, "indices": indices} for label, ms, indices in (
        ("Before first input (completed)", before, [r["index"] for r in completed if r["firstMs"] is not None]),
        ("After first input · unrevised", after_clean, [r["index"] for r in completed if not r["revisionEpisodes"]]),
        ("After first input · revised", after_revised, [r["index"] for r in completed if r["revisionEpisodes"]]),
        ("Completed · first input unavailable", unpartitioned, [r["index"] for r in completed if r["firstMs"] is None]),
        ("Unfinished observation", unfinished, [r["index"] for r in records if r["unfinishedMs"] is not None]),
        ("Unattributed / presentation gaps", max(0, duration - accounted) if duration is not None else None, []))]
    return {"version": VERSION, "questions": records, "summary": summary, "durationMs": duration, "splits": splits, "splitWidthMs": width, "timeBreakdown": breakdown,
            "reel": {"slowest": [r["index"] for r in sorted(completed, key=lambda r: r["totalMs"], reverse=True)[:5]],
                     "revisions": [r["index"] for r in revised], "fastest": [r["index"] for r in sorted(completed, key=lambda r: r["totalMs"])[:5]]}}


def profile(sessions):
    groups = defaultdict(list)
    for s in sessions:
        for r in s["runAnalytics"]["questions"]:
            if r["totalMs"] is not None:
                for feature in r["features"]:
                    groups[feature].append(r)
    return [{"feature": key, "count": len(rs), "medianMs": median(r["totalMs"] for r in rs),
             "entryMedianMs": median(r["entryMs"] for r in rs if r["entryMs"] is not None) if any(r["entryMs"] is not None for r in rs) else None,
             "firstMedianMs": median(r["firstMs"] for r in rs if r["firstMs"] is not None) if any(r["firstMs"] is not None for r in rs) else None,
             "revisedCount": sum(r["revisionEpisodes"] > 0 for r in rs)} for key, rs in sorted(groups.items())]
