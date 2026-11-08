"""Local persistence API. The arithmetic interaction itself runs in the browser."""
from contextlib import contextmanager
from collections import OrderedDict
from threading import Lock
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sqlite3
from typing import Literal
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request, Query
from pydantic import BaseModel, ConfigDict, Field
from starlette.responses import JSONResponse, Response

from server.measurements import TIMING_DEFINITIONS, derive_session, export_csv
from server.analytics import enrich, add_details, filter_sessions, analytics, standard_config
from server.decimal_input import decimal_lexeme
from server.run_analytics import profile, describe_run


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Range(Model):
    min: str
    max: str
    decimalPlaces: int


class Group(Model):
    id: str
    version: Literal[1]
    name: str
    share: str
    first: Range
    second: Range
    allowNegative: bool


class Operation(Model):
    id: Literal["addition", "subtraction", "multiplication", "division"]
    version: Literal[1]
    share: str
    groups: list[Group]


class SessionSettings(Model):
    format: Literal["timed", "endless"]
    durationSeconds: str
    countdown: bool


class Config(Model):
    version: Literal[1]
    operations: list[Operation]
    session: SessionSettings


def ticks(text: str, precision: int) -> int:
    try:
        value = decimal_lexeme(text)
    except ValueError:
        raise ValueError("Enter a decimal number without separators or exponents.")
    negative = value.startswith("-")
    parts = value.lstrip("+-").split(".")
    fraction = parts[1] if len(parts) > 1 else ""
    if len(fraction) > precision and any(c != "0" for c in fraction[precision:]):
        raise ValueError("Bounds must fit the selected decimal places.")
    value = int((parts[0] or "0") + fraction[:precision].ljust(precision, "0"))
    return -value if negative else value


def validate(config: Config) -> None:
    errors: dict[str, str] = {}
    ids: set[str] = set()

    def share(value: str, key: str) -> int:
        try:
            result = ticks(value, 2)
            if not 0 <= result <= 10000:
                raise ValueError("Use a percentage from 0 to 100, with at most two decimal places.")
            return result
        except ValueError as exc:
            errors[key] = str(exc)
            return 0

    total = 0
    for op in config.operations:
        path = f"operations.{op.id}"
        if op.id in ids:
            errors[path] = "Operation identities must be unique and versioned."
        ids.add(op.id)
        op_share = share(op.share, path + ".share")
        total += op_share
        group_total = 0
        for group in op.groups:
            path_group = f"groups.{group.id}"
            if not group.id or group.id in ids:
                errors[path_group] = "Exercise identities must be unique and versioned."
            ids.add(group.id)
            if not group.name.strip():
                errors[path_group + ".name"] = "Give this exercise group a name."
            group_share = share(group.share, path_group + ".share")
            group_total += group_share
            ranges = []
            for name in ("first", "second"):
                value = getattr(group, name)
                try:
                    if not 0 <= value.decimalPlaces <= 3:
                        raise ValueError("Choose 0–3 decimal places.")
                    minimum, maximum = ticks(value.min, value.decimalPlaces), ticks(value.max, value.decimalPlaces)
                    if minimum > maximum:
                        raise ValueError("Minimum must be less than or equal to maximum.")
                    ranges.append((minimum, maximum, value.decimalPlaces))
                except ValueError as exc:
                    errors[path_group + "." + name] = str(exc)
            if len(ranges) == 2 and op_share and group_share:
                first, second = ranges
                if op.id == "division" and first[:2] == (0, 0):
                    errors[path_group + ".first"] = "A divisor range must contain a nonzero value."
                if op.id == "subtraction" and not group.allowNegative:
                    common = max(first[2], second[2])
                    if first[1] * 10 ** (common - first[2]) < second[0] * 10 ** (common - second[2]):
                        errors[path_group + ".second"] = "No nonnegative answers exist in these ranges. Change the ranges or allow negatives."
        if op_share and group_total != 10000:
            errors[path + ".groups"] = "Group shares must total exactly 100% for this active operation."
    if total != 10000:
        errors["operations"] = "Operation shares must total exactly 100%."
    duration = config.session.durationSeconds
    if config.session.format == "timed" and (not re.fullmatch(r"\d+", duration, flags=re.ASCII) or not 1 <= int(duration) <= 9007199254740991):
        errors["duration"] = "Enter a positive whole number of seconds."
    if errors:
        raise HTTPException(422, detail=errors)


class PresetWrite(Model):
    name: str
    config: Config


class Rename(Model):
    name: str


class SessionWrite(Model):
    replayOf: str | None = None
    creationKey: str | None = Field(None, min_length=1, max_length=128)
    config: Config
    seed: str
    generatorVersion: Literal["exact-grid-v1", "zetamac-reverse-v1"]
    policyVersion: Literal["hierarchical-shares-v1", "equal-operations-v1"]
    measurementVersion: Literal["response-timing-v1"] | None = None
    mode: Literal["standard", "custom"] | None = None
    contentVersion: Literal["zetamac-default-v1", "custom-grid-v1"] | None = None


class DeleteSelection(Model):
    sessionIds: list[str]


class AnnotationWrite(Model):
    label: Literal["mistyped", "recalculated", "unsure", "unlabelled"]
    expectedRevision: int = Field(ge=0)


class Event(Model):
    sequence: int = Field(ge=0)
    type: Literal["session-started", "question-presented", "input-changed", "answer-accepted", "session-ended"]
    elapsedMs: float = Field(ge=0, allow_inf_nan=False)
    payload: dict


class EventBatch(Model):
    events: list[Event]


def encoded(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_app(database: str | Path) -> FastAPI:
    path = Path(database)
    path.parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def connection():
        db = sqlite3.connect(path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                yield db
        finally:
            db.close()

    with connection() as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript("""
        CREATE TABLE IF NOT EXISTS presets(id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, config TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, config TEXT NOT NULL, seed TEXT NOT NULL, generator TEXT NOT NULL, policy TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', measurement_version TEXT);
        CREATE TABLE IF NOT EXISTS observations(session_id TEXT NOT NULL REFERENCES sessions(id), sequence INTEGER NOT NULL, event TEXT NOT NULL, PRIMARY KEY(session_id,sequence));
        """)
        # Additive migration: historical observations/configurations stay intact.
        if "measurement_version" not in {row["name"] for row in db.execute("PRAGMA table_info(sessions)")}:
            db.execute("ALTER TABLE sessions ADD COLUMN measurement_version TEXT")
        for column in ("mode", "content_version"):
            if column not in {row["name"] for row in db.execute("PRAGMA table_info(sessions)")}:
                db.execute(f"ALTER TABLE sessions ADD COLUMN {column} TEXT")
        if "creation_key" not in {row["name"] for row in db.execute("PRAGMA table_info(sessions)")}:
            db.execute("ALTER TABLE sessions ADD COLUMN creation_key TEXT")
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS session_creation_key ON sessions(creation_key) WHERE creation_key IS NOT NULL")
        if "replay_of" not in {row["name"] for row in db.execute("PRAGMA table_info(sessions)")}:
            db.execute("ALTER TABLE sessions ADD COLUMN replay_of TEXT")
        db.execute("CREATE TABLE IF NOT EXISTS question_annotations(session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, presentation_sequence INTEGER NOT NULL, label TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(session_id,presentation_sequence))")
    app = FastAPI(title="Arithmetic local API", version="1.0.0")
    # Cache only derived reads, never observations. Signatures are read in the
    # same transaction as metadata/events, including writes from other workers.
    session_cache = OrderedDict()
    cache_lock = Lock()
    cache_event_count = 0

    @app.middleware("http")
    async def local_origin(request: Request, call_next):
        origin = request.headers.get("origin")
        if origin and urlparse(origin).hostname not in ("localhost", "127.0.0.1", "::1"):
            return JSONResponse({"detail": "This API accepts local application origins only."}, status_code=403)
        return await call_next(request)

    def preset_name(name: str) -> str:
        if not name.strip():
            raise HTTPException(422, detail="Enter a preset name.")
        return name.strip()

    @app.get("/api/setup")
    def setup():
        with connection() as db:
            presets = [{"id":row["id"], "name":row["name"], "config":json.loads(row["config"])} for row in db.execute("SELECT * FROM presets ORDER BY name")]
            last = db.execute("SELECT value FROM settings WHERE key='last-config'").fetchone()
        return {"presets":presets, "lastConfig":json.loads(last[0]) if last else None}

    @app.put("/api/last-config")
    def save_last(config: Config):
        validate(config)
        with connection() as db:
            db.execute("INSERT INTO settings VALUES('last-config', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (encoded(config.model_dump()),))
        return {"saved":True}

    @app.post("/api/presets", status_code=201)
    def save_preset(body: PresetWrite):
        validate(body.config)
        identity = str(uuid4())
        name = preset_name(body.name)
        try:
            with connection() as db:
                db.execute("INSERT INTO presets VALUES(?,?,?)", (identity, name, encoded(body.config.model_dump())))
        except sqlite3.IntegrityError:
            raise HTTPException(409, detail="A preset with this name already exists.")
        return {"id":identity, "name":name, "config":body.config.model_dump()}

    @app.put("/api/presets/{identity}")
    def update_preset(identity: str, body: PresetWrite):
        validate(body.config)
        name = preset_name(body.name)
        try:
            with connection() as db:
                if not db.execute("UPDATE presets SET name=?, config=? WHERE id=?", (name, encoded(body.config.model_dump()), identity)).rowcount:
                    raise HTTPException(404, detail="Preset not found.")
        except sqlite3.IntegrityError:
            raise HTTPException(409, detail="A preset with this name already exists.")
        return {"id":identity, "name":name, "config":body.config.model_dump()}

    @app.patch("/api/presets/{identity}")
    def rename_preset(identity: str, body: Rename):
        name = preset_name(body.name)
        try:
            with connection() as db:
                if not db.execute("UPDATE presets SET name=? WHERE id=?", (name, identity)).rowcount:
                    raise HTTPException(404, detail="Preset not found.")
        except sqlite3.IntegrityError:
            raise HTTPException(409, detail="A preset with this name already exists.")
        return {"id":identity, "name":name}

    @app.delete("/api/presets/{identity}")
    def delete_preset(identity: str):
        with connection() as db:
            if not db.execute("DELETE FROM presets WHERE id=?", (identity,)).rowcount:
                raise HTTPException(404, detail="Preset not found.")
        return {"deleted":True}

    @app.post("/api/sessions", status_code=201)
    def start_session(body: SessionWrite):
        validate(body.config)
        if body.mode == "standard":
            if (body.config.model_dump() != standard_config() or body.generatorVersion != "zetamac-reverse-v1" or body.policyVersion != "equal-operations-v1" or body.contentVersion != "zetamac-default-v1" or body.measurementVersion != "response-timing-v1"):
                raise HTTPException(422, detail="Standard Zetamac requires its fixed versioned rules and 120-second settings.")
        elif body.generatorVersion != "exact-grid-v1" or body.policyVersion != "hierarchical-shares-v1" or body.contentVersion not in (None, "custom-grid-v1"):
            raise HTTPException(422, detail="Custom and legacy sessions require the exact-grid generator and weighted policy.")
        if body.mode == "custom" and body.contentVersion != "custom-grid-v1":
            raise HTTPException(422, detail="New custom sessions require custom-grid-v1 content provenance.")
        identity = str(uuid4())
        with connection() as db:
            db.execute("BEGIN IMMEDIATE")
            values = (encoded(body.config.model_dump()), body.seed, body.generatorVersion, body.policyVersion, body.measurementVersion, body.mode, body.contentVersion, body.replayOf)
            if body.creationKey:
                previous = db.execute("SELECT * FROM sessions WHERE creation_key=?", (body.creationKey,)).fetchone()
                if previous:
                    original = tuple(previous[key] for key in ("config", "seed", "generator", "policy", "measurement_version", "mode", "content_version", "replay_of"))
                    if original != values:
                        raise HTTPException(409, detail="This start request already belongs to a different session setup.")
                    return {"id": previous["id"]}
            if body.replayOf:
                source = db.execute("SELECT * FROM sessions WHERE id=?", (body.replayOf,)).fetchone()
                source_config = json.loads(source["config"]) if source else None
                if source_config and not body.config.session.countdown:
                    source_config["session"]["countdown"] = False
                if source is None or encoded(source_config) != values[0] or tuple(source[k] for k in ("seed", "generator", "policy", "measurement_version", "mode", "content_version")) != values[1:7]:
                    raise HTTPException(422, detail="A challenge must repeat an existing run's exact configuration, seed and provenance.")
            db.execute("INSERT INTO sessions(id,config,seed,generator,policy,measurement_version,mode,content_version,replay_of,created_at,creation_key) VALUES(?,?,?,?,?,?,?,?,?,?,?)", (identity, *values, now(), body.creationKey))
        return {"id":identity}

    @app.post("/api/sessions/{identity}/observations")
    def observations(identity: str, body: EventBatch):
        with connection() as db:
            # Serialize the existence checks with the inserts. A normal flush
            # and pagehide beacon can otherwise both observe an absent sequence.
            db.execute("BEGIN IMMEDIATE")
            if not db.execute("SELECT 1 FROM sessions WHERE id=?", (identity,)).fetchone():
                raise HTTPException(404, detail="Session not found.")
            for event in body.events:
                value = encoded(event.model_dump())
                previous = db.execute("SELECT event FROM observations WHERE session_id=? AND sequence=?", (identity,event.sequence)).fetchone()
                if previous:
                    if previous[0] != value:
                        raise HTTPException(409, detail="An observation with this sequence already has different contents.")
                    continue
                db.execute("INSERT INTO observations VALUES(?,?,?)", (identity, event.sequence, value))
                if event.type == "session-ended":
                    db.execute("UPDATE sessions SET status='ended' WHERE id=?", (identity,))
        return {"saved":True}

    def read_sessions(identity: str | None = None, detailed=True):
        nonlocal cache_event_count
        with connection() as db:
            # Explicit read transaction pins metadata and every event query to
            # one SQLite snapshot, even when another tab appends concurrently.
            db.execute("BEGIN")
            query = """SELECT s.*,
                (SELECT COUNT(*) FROM observations WHERE session_id=s.id) AS event_count,
                (SELECT MAX(sequence) FROM observations WHERE session_id=s.id) AS last_sequence
                FROM sessions s"""
            rows = db.execute(query + " WHERE s.id=?", (identity,)).fetchall() if identity is not None else db.execute(query + " ORDER BY created_at,id").fetchall()
            if identity is not None and not rows:
                raise HTTPException(404, detail="Session not found.")
            annotations_by_id = {}
            annotation_rows = db.execute("SELECT * FROM question_annotations WHERE session_id=? ORDER BY presentation_sequence", (identity,)) if identity is not None else db.execute("SELECT * FROM question_annotations ORDER BY session_id,presentation_sequence")
            for a in annotation_rows:
                annotations_by_id.setdefault(a["session_id"], []).append({"presentationSequence": a["presentation_sequence"], "label": a["label"], "revision": a["revision"], "updatedAt": a["updated_at"]})
            signatures = {row["id"]: (tuple(row), encoded(annotations_by_id.get(row["id"], []))) for row in rows}
            # Gather hits before filling misses so a large scan cannot evict its
            # own later hits. Bound memory without an all-history replay cache.
            with cache_lock:
                hits = {}
                for row in rows:
                    cached = session_cache.get(row["id"])
                    if cached and cached[0] == signatures[row["id"]]:
                        hits[row["id"]] = cached[1]
                        session_cache.move_to_end(row["id"])
            sessions = []
            for row in rows:
                session = hits.get(row["id"])
                if session is None:
                    events = [json.loads(record[0]) for record in db.execute("SELECT event FROM observations WHERE session_id=? ORDER BY sequence", (row["id"],))]
                    annotations = annotations_by_id.get(row["id"], [])
                    session = enrich(derive_session({"id":row["id"], "config":json.loads(row["config"]), "seed":row["seed"], "generatorVersion":row["generator"], "policyVersion":row["policy"], "measurementVersion":row["measurement_version"], "mode":row["mode"], "contentVersion":row["content_version"], "replayOf":row["replay_of"], "annotations":annotations, "createdAt":row["created_at"], "status":row["status"], "events":events}), detailed=False)
                    with cache_lock:
                        previous = session_cache.get(row["id"])
                        if previous:
                            cache_event_count -= len(previous[1]["events"])
                        session_cache[row["id"]] = (signatures[row["id"]], session)
                        cache_event_count += len(events)
                        session_cache.move_to_end(row["id"])
                        while len(session_cache) > 2048 or cache_event_count > 250_000:
                            _, removed = session_cache.popitem(last=False)
                            cache_event_count -= len(removed[1]["events"])
                sessions.append(add_details(session) if detailed else session)
            exported_at = now()
        return sessions, exported_at

    @app.get("/api/sessions")
    def session_history(offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100), mode: Literal["standard", "custom", "legacy"] | None = None,
                        status: Literal["ended", "ongoing", "incomplete"] | None = None, after: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
                        before: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"), configuration: str | None = None, eligibleOnly: bool = False):
        sessions, snapshot_at = read_sessions(detailed=False)
        selected = filter_sessions(sessions, mode, status, after, before, configuration)
        if eligibleOnly:
            selected = [session for session in selected if session["comparisonEligible"]]
        records = [{key: value for key, value in session.items() if key not in ("events", "questions", "analysis", "runAnalytics")} for session in selected[offset:offset + limit]]
        return {"sessions": records, "total": len(selected), "offset": offset, "limit": limit, "snapshotAt": snapshot_at}

    @app.get("/api/analytics")
    def session_analytics(cohort: str | None = None, includePartial: bool = False, after: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"), before: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$")):
        sessions, snapshot_at = read_sessions(detailed=False)
        return {**analytics(filter_sessions(sessions, after=after, before=before), cohort, includePartial), "snapshotAt": snapshot_at, "totalSavedSessionCount": len(sessions)}

    @app.get("/api/explorer/{identity}")
    def explorer(identity: str):
        sessions, snapshot = read_sessions(detailed=False)
        selected = next((s for s in sessions if s["id"] == identity), None)
        if selected is None:
            raise HTTPException(404, detail="Session not found.")
        peers = [s for s in sessions if s["cohortKey"] == selected["cohortKey"] and s["comparisonEligible"] and s["id"] != identity]
        selected = {**selected, "runAnalytics": describe_run(selected)}
        peers = [{**s, "runAnalytics": describe_run(s)} for s in peers]
        baselines = {}
        for s in peers:
            if (s["createdAt"], s["id"]) >= (selected["createdAt"], selected["id"]):
                continue
            for r in s["runAnalytics"]["questions"]:
                if r["totalMs"] is not None:
                    key = "|".join([r["operation"], r["features"][1], r["features"][4]])
                    baselines.setdefault(key, []).append(r["totalMs"])
        from statistics import median
        return {"snapshotAt": snapshot, "profile": profile(peers + [selected]), "profileSessionCount": len(peers) + 1,
                "baselines": {key: {"count": len(values), "medianMs": median(values)} for key, values in baselines.items()},
                "comparisons": [{"id": s["id"], "createdAt": s["createdAt"], "score": s["score"],
                                 "runAnalytics": {"questions": [{"acceptedMs": q["acceptedMs"]} for q in s["runAnalytics"]["questions"] if q["acceptedMs"] is not None]}} for s in peers],
                "historicalProfile": profile([s for s in peers if (s["createdAt"], s["id"]) < (selected["createdAt"], selected["id"])])}

    @app.put("/api/sessions/{identity}/annotations/{sequence}")
    def annotate(identity: str, sequence: int, body: AnnotationWrite):
        with connection() as db:
            db.execute("BEGIN IMMEDIATE")
            session = db.execute("SELECT status FROM sessions WHERE id=?", (identity,)).fetchone()
            event = db.execute("SELECT event FROM observations WHERE session_id=? AND sequence=?", (identity, sequence)).fetchone()
            if session is None or event is None or json.loads(event[0]).get("type") != "question-presented":
                raise HTTPException(404, detail="Question not found.")
            if session["status"] != "ended":
                raise HTTPException(409, detail="Label questions after ending the run.")
            previous = db.execute("SELECT revision FROM question_annotations WHERE session_id=? AND presentation_sequence=?", (identity, sequence)).fetchone()
            revision = previous[0] if previous else 0
            if revision != body.expectedRevision:
                raise HTTPException(409, detail="This label changed in another page. Refresh the session before editing it.")
            db.execute("INSERT INTO question_annotations VALUES(?,?,?,?,?) ON CONFLICT(session_id,presentation_sequence) DO UPDATE SET label=excluded.label,revision=excluded.revision,updated_at=excluded.updated_at", (identity, sequence, body.label, revision + 1, now()))
        return {"revision": revision + 1, "label": body.label}

    @app.get("/api/sessions/deletion-preview")
    def deletion_preview(mode: Literal["standard", "custom", "legacy"] | None = None,
                         status: Literal["ended", "ongoing", "incomplete"] | None = None,
                         after: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
                         before: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
                         configuration: str | None = None, eligibleOnly: bool = False):
        sessions, snapshot_at = read_sessions(detailed=False)
        sessions = filter_sessions(sessions, mode, status, after, before, configuration)
        if eligibleOnly:
            sessions = [session for session in sessions if session["comparisonEligible"]]
        ids = [s["id"] for s in sessions if s["status"] == "ended" and any(e.get("type") == "session-ended" for e in s["events"])]
        return {"sessionIds": ids, "count": len(ids), "protectedCount": len(sessions) - len(ids), "snapshotAt": snapshot_at}

    def delete_closed(ids):
        nonlocal cache_event_count
        identities = list(dict.fromkeys(ids))
        with connection() as db:
            db.execute("BEGIN IMMEDIATE")
            for identity in identities:
                row = db.execute("SELECT status FROM sessions WHERE id=?", (identity,)).fetchone()
                if row is None:
                    raise HTTPException(409, detail="The selected history changed. Refresh the deletion scope and try again.")
                terminal = any(json.loads(record[0]).get("type") == "session-ended" for record in db.execute("SELECT event FROM observations WHERE session_id=?", (identity,)))
                if row["status"] != "ended" or not terminal:
                    raise HTTPException(409, detail="Ongoing or pending sessions are protected from deletion.")
            for identity in identities:
                db.execute("DELETE FROM observations WHERE session_id=?", (identity,))
                db.execute("DELETE FROM sessions WHERE id=?", (identity,))
        with cache_lock:
            for identity in identities:
                removed = session_cache.pop(identity, None)
                if removed:
                    cache_event_count -= len(removed[1]["events"])
        return {"deletedCount": len(identities)}

    @app.delete("/api/sessions")
    def delete_history(body: DeleteSelection):
        # Only the exact confirmed preview IDs are deleted; newly arriving rows stay.
        return delete_closed(body.sessionIds)

    @app.delete("/api/sessions/{identity}")
    def delete_session(identity: str):
        return delete_closed([identity])

    @app.get("/api/sessions/{identity}")
    def read_session(identity: str):
        return read_sessions(identity)[0][0]

    def export_response(format: str, identity: str | None = None):
        sessions, exported_at = read_sessions(identity)
        filename = "practice-session-" + identity if identity is not None else "practice-sessions-" + exported_at[:19].replace(":", "-")
        headers = {"Content-Disposition": f'attachment; filename="{filename}.{format}"', "Cache-Control": "no-store"}
        if format == "csv":
            return Response(export_csv(sessions), media_type="text/csv; charset=utf-8", headers=headers)
        return JSONResponse({"exportVersion":1, "exportedAt":exported_at, "timingDefinitions":TIMING_DEFINITIONS, "sessions":sessions}, headers=headers)

    @app.get("/api/sessions/{identity}/export")
    def export_session(identity: str, format: Literal["json", "csv"]):
        return export_response(format, identity)

    @app.get("/api/exports/sessions")
    def export_sessions(format: Literal["json", "csv"]):
        return export_response(format)

    return app


app = create_app(os.environ.get("ARITHMETIC_DB", str(Path(__file__).resolve().parents[1] / "data" / "arithmetic.sqlite3")))
