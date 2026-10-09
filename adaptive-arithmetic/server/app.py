"""Local persistence API. The arithmetic interaction itself runs in the browser."""
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sqlite3
from typing import Literal
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from starlette.responses import JSONResponse, Response

from server.measurements import TIMING_DEFINITIONS, derive_session, export_csv


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
    if not re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)", text.strip(), flags=re.ASCII):
        raise ValueError("Enter a decimal number without separators or exponents.")
    negative = text.strip().startswith("-")
    parts = text.strip().lstrip("+-").split(".")
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
    config: Config
    seed: str
    generatorVersion: Literal["exact-grid-v1"]
    policyVersion: Literal["hierarchical-shares-v1"]
    measurementVersion: Literal["response-timing-v1"] | None = None


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
    app = FastAPI(title="Arithmetic local API", version="1.0.0")

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
        identity = str(uuid4())
        with connection() as db:
            db.execute("INSERT INTO sessions(id,config,seed,generator,policy,created_at,measurement_version) VALUES(?,?,?,?,?,?,?)", (identity, encoded(body.config.model_dump()), body.seed, body.generatorVersion, body.policyVersion, now(), body.measurementVersion))
        return {"id":identity}

    @app.post("/api/sessions/{identity}/observations")
    def observations(identity: str, body: EventBatch):
        with connection() as db:
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

    def read_sessions(identity: str | None = None):
        with connection() as db:
            # Explicit read transaction pins metadata and every event query to
            # one SQLite snapshot, even when another tab appends concurrently.
            db.execute("BEGIN")
            rows = db.execute("SELECT * FROM sessions WHERE id=?", (identity,)).fetchall() if identity is not None else db.execute("SELECT * FROM sessions ORDER BY created_at,id").fetchall()
            if identity is not None and not rows:
                raise HTTPException(404, detail="Session not found.")
            sessions = []
            for row in rows:
                events = [json.loads(record[0]) for record in db.execute("SELECT event FROM observations WHERE session_id=? ORDER BY sequence", (row["id"],))]
                sessions.append(derive_session({"id":row["id"], "config":json.loads(row["config"]), "seed":row["seed"], "generatorVersion":row["generator"], "policyVersion":row["policy"], "measurementVersion":row["measurement_version"], "createdAt":row["created_at"], "status":row["status"], "events":events}))
            exported_at = now()
        return sessions, exported_at

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
