import { useEffect, useId, useMemo, useState } from "react";
import { request } from "./api";
import { displaySeconds as seconds, type SavedSession } from "./measurements";
import {
  practiceSelection,
  scoreAt,
  paceSteps,
  typicalPaceSteps,
  replayFrameAt,
  boundedTarget,
  type ExplorerContext,
  type RunAnalytics,
  type RunQuestion,
} from "./explorer";
import "./explorer.css";

const symbols: Record<string, string> = {
  addition: "+",
  subtraction: "−",
  multiplication: "×",
  division: "÷",
};
const expression = (q: RunQuestion) =>
  `${q.left} ${symbols[q.operation]} ${q.right}`;
const delta = (n: number | null) =>
  n === null ? "—" : `${n >= 0 ? "+" : "−"}${seconds(Math.abs(n))}`;
const colours = ["#2563eb", "#a16207", "#0f766e", "#9333ea", "#be123c"];
type Session = SavedSession & { runAnalytics: RunAnalytics };

function Replay({ question: q }: { question: RunQuestion }) {
  const [cursor, setCursor] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1);
  const [frame, setFrame] = useState(-1);
  const duration = q.totalMs ?? q.unfinishedMs ?? 0;
  const timed = q.frames.every((f) => f.atMs !== null) && duration > 0;
  useEffect(() => {
    setCursor(0);
    setFrame(-1);
    setPlaying(false);
  }, [q.presentationSequence]);
  useEffect(() => {
    if (!playing || !timed) return;
    const origin = performance.now(),
      initial = cursor;
    const timer = setInterval(() => {
      const next = Math.min(
        duration,
        initial + (performance.now() - origin) * speed,
      );
      setCursor(next);
      if (next >= duration) setPlaying(false);
    }, 32);
    return () => clearInterval(timer);
  }, [playing, speed, q.presentationSequence, timed]);
  const shown =
    frame >= 0
      ? q.frames[frame]
      : q.frames.filter((f) => f.atMs !== null && f.atMs <= cursor).at(-1);
  function step(direction: number) {
    setPlaying(false);
    const origin = frame >= 0 ? frame : replayFrameAt(q, cursor);
    const next = Math.max(
      -1,
      Math.min(q.frames.length - 1, origin + direction),
    );
    setFrame(next);
    setCursor(next >= 0 ? (q.frames[next].atMs ?? 0) : 0);
  }
  return (
    <div className="replay-card">
      <h3>Answer replay · question {q.index}</h3>
      <div className="replay-expression">
        {expression(q)} ={" "}
        <output aria-label="Replayed answer">{shown?.value || "\u00a0"}</output>
      </div>
      <p>
        {seconds(cursor)} / {seconds(duration)}
        {q.lowerBound ? " · observed lower bound" : ""}
      </p>
      <div className="explorer-controls">
        <button
          className="secondary-button"
          disabled={!timed || !q.frames.length}
          onClick={() => {
            setFrame(-1);
            if (cursor >= duration) setCursor(0);
            setPlaying((v) => !v);
          }}
        >
          {playing ? "Pause replay" : "Play replay"}
        </button>
        <button
          className="text-button"
          disabled={!q.frames.length}
          onClick={() => {
            step(-1);
          }}
        >
          Previous edit
        </button>
        <button
          className="text-button"
          disabled={!q.frames.length}
          onClick={() => {
            step(1);
          }}
        >
          Next edit
        </button>
        <label>
          Replay speed{" "}
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            {[0.25, 0.5, 1, 2, 4].map((n) => (
              <option key={n} value={n}>
                {n}×
              </option>
            ))}
          </select>
        </label>
      </div>
      <input
        aria-label="Replay position"
        type="range"
        min="0"
        max={Math.max(1, duration)}
        value={cursor}
        disabled={!timed}
        onChange={(e) => {
          setPlaying(false);
          setFrame(-1);
          setCursor(Number(e.target.value));
        }}
      />
      {!timed && (
        <p className="section-help">
          Timing is unavailable. Step through the recorded field changes
          instead.
        </p>
      )}
      <p className="section-help">
        {q.telemetry} · {q.inputChanges} field changes · {q.charactersRemoved}{" "}
        characters removed · longest between-edit pause {seconds(q.maxPauseMs)}.
      </p>
      <details>
        <summary>Inspect replay events</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>At</th>
                <th>Field value</th>
                <th>Input type</th>
              </tr>
            </thead>
            <tbody>
              {q.frames.map((f) => (
                <tr key={f.sequence}>
                  <td>{seconds(f.atMs)}</td>
                  <td>
                    <code>{JSON.stringify(f.value)}</code>
                  </td>
                  <td>
                    {f.inputType}
                    {f.revision ? " · revision" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function RunExplorer({
  session,
  onRefresh,
}: {
  session: Session;
  onRefresh: () => void;
}) {
  const run = session.runAnalytics,
    rows = run.questions,
    stats = run.summary,
    chartId = useId();
  const [context, setContext] = useState<ExplorerContext | null>(null),
    [contextError, setContextError] = useState(""),
    [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<number[]>([]),
    [focus, setFocus] = useState(1);
  const [axis, setAxis] = useState("question"),
    [colour, setColour] = useState("operation"),
    [operation, setOperation] = useState("all"),
    [revisionsOnly, setRevisionsOnly] = useState(false);
  const [rangeStart, setRangeStart] = useState(1),
    [rangeEnd, setRangeEnd] = useState(rows.length);
  const [ghost, setGhost] = useState("previous"),
    [target, setTarget] = useState("60"),
    [profileFilter, setProfileFilter] = useState("");
  const [labelError, setLabelError] = useState(""),
    [labelBusy, setLabelBusy] = useState(false),
    [practiceError, setPracticeError] = useState("");
  const [annotations, setAnnotations] = useState(session.annotations || []);
  useEffect(() => {
    setAnnotations(session.annotations || []);
  }, [session.annotations]);
  useEffect(() => {
    let live = true;
    setContext(null);
    setContextError("");
    request<ExplorerContext>(`/api/explorer/${encodeURIComponent(session.id)}`)
      .then((data) => {
        if (live) setContext(data);
      })
      .catch((e) => {
        if (live) setContextError(e.message);
      });
    return () => {
      live = false;
    };
  }, [session.id, retry]);
  const current = rows.find((q) => q.index === focus) || rows[0];
  const visible = rows.filter(
    (q) =>
      (operation === "all" || q.operation === operation) &&
      (!revisionsOnly || q.revisionEpisodes > 0),
  );
  const visibleSelected = rows.filter((q) => selected.includes(q.index));
  const selectionTimes = visibleSelected.flatMap((q) =>
    q.totalMs === null ? [] : [q.totalMs],
  );
  const choose = (indices: number[]) => {
    setSelected(indices);
    if (indices.length) setFocus(indices[0]);
  };
  const max = Math.max(
    1,
    ...rows.flatMap((q) => [q.totalMs ?? 0, q.firstMs ?? 0]),
  );
  const duration = run.durationMs;
  const colourKeys = [
    ...new Set(
      rows.map((q) =>
        colour === "operation"
          ? q.operation
          : colour === "group"
            ? q.groupId
            : q.revisionEpisodes
              ? "revised"
              : "unrevised",
      ),
    ),
  ];
  const colourFor = (q: RunQuestion) =>
    colours[
      colourKeys.indexOf(
        colour === "operation"
          ? q.operation
          : colour === "group"
            ? q.groupId
            : q.revisionEpisodes
              ? "revised"
              : "unrevised",
      ) % colours.length
    ];
  const x = (q: RunQuestion) =>
    48 +
    (axis === "elapsed"
      ? (q.presentedMs ?? 0) / Math.max(1, duration ?? 1)
      : (q.index - 1) / Math.max(1, rows.length - 1)) *
      780;
  const y = (ms: number) => 220 - (Math.min(ms, max) / max) * 180;
  const peers = context?.comparisons || [];
  const previous = [...peers]
    .filter(
      (p) =>
        p.createdAt < session.createdAt ||
        (p.createdAt === session.createdAt && p.id < session.id),
    )
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    )[0];
  const best = [...peers].sort((a, b) => b.score - a.score)[0];
  const peer =
    ghost === "previous"
      ? previous
      : ghost === "best"
        ? best
        : peers.find((p) => p.id === ghost);
  const hasComparison =
    duration !== null &&
    (ghost === "target"
      ? duration > 0
      : ghost === "typical"
        ? peers.length > 0
        : Boolean(peer));
  const paceDuration = duration ?? 0;
  const medianSteps = useMemo(
    () =>
      ghost === "typical"
        ? typicalPaceSteps(
            (context?.comparisons || []).map((p) => p.runAnalytics),
            paceDuration,
          )
        : [],
    [ghost, context, paceDuration],
  );
  const paceMax = Math.max(
    1,
    stats.completed,
    ghost === "typical"
      ? (medianSteps.at(-1)?.[1] ?? 0)
      : peer
        ? scoreAt(peer.runAnalytics, paceDuration)
        : 0,
    ghost === "target" ? boundedTarget(target) : 0,
  );
  const typical = (time: number) => {
    const scores = peers
      .map((p) => scoreAt(p.runAnalytics, time))
      .sort((a, b) => a - b);
    return scores.length
      ? (scores[Math.floor((scores.length - 1) / 2)] +
          scores[Math.ceil((scores.length - 1) / 2)]) /
          2
      : 0;
  };
  const ghostAt = (time: number) =>
    ghost === "target"
      ? (boundedTarget(target) * time) / (paceDuration || 1)
      : ghost === "typical"
        ? typical(time)
        : peer
          ? scoreAt(peer.runAnalytics, time)
          : 0;
  const plotPace = (points: [number, number][]) =>
    points
      .map(
        ([time, score]) =>
          `${48 + (time / (paceDuration || 1)) * 780},${220 - (score / paceMax) * 180}`,
      )
      .join(" ");
  const stepPoints = (source: Parameters<typeof paceSteps>[0]) =>
    plotPace(paceSteps(source, paceDuration));
  async function annotate(label: string) {
    if (!current) return;
    setLabelBusy(true);
    setLabelError("");
    try {
      const saved = await request<{ revision: number; label: string }>(
        `/api/sessions/${session.id}/annotations/${current.presentationSequence}`,
        "PUT",
        {
          label,
          expectedRevision:
            annotations.find(
              (a) => a.presentationSequence === current.presentationSequence,
            )?.revision || 0,
        },
      );
      setAnnotations((values) => [
        ...values.filter(
          (a) => a.presentationSequence !== current.presentationSequence,
        ),
        { ...saved, presentationSequence: current.presentationSequence },
      ]);
    } catch (e) {
      setLabelError((e as Error).message);
    } finally {
      setLabelBusy(false);
    }
  }
  return (
    <section className="run-explorer" aria-label="Run explorer">
      <header>
        <p className="explorer-eyebrow">THE ANATOMY OF YOUR RUN</p>
        <h2>Run explorer</h2>
        <p className="section-help">
          Select questions to inspect their input, compare a stretch, or create
          practice. Timings describe interaction; first input is not pure
          calculation time.
        </p>
      </header>
      <div className="explorer-metrics">
        {[
          [
            `${stats.revisedCompleted} / ${stats.completed}`,
            "Timed completions revised",
          ],
          [stats.revisionEpisodes, "Revision episodes · all questions"],
          [stats.revisedUnfinished, "Unfinished questions revised"],
          [seconds(stats.iqrMs), "Middle 50% timing spread"],
          [seconds(stats.p90Ms), "90th percentile response"],
          [
            stats.slowestFiveShare === null
              ? "—"
              : `${(stats.slowestFiveShare * 100).toFixed(1)}%`,
            "Run time in slowest five completions",
          ],
        ].map(([value, label]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="explorer-controls">
        <label>
          Horizontal axis{" "}
          <select value={axis} onChange={(e) => setAxis(e.target.value)}>
            <option value="question">Question position</option>
            <option value="elapsed">Elapsed time</option>
          </select>
        </label>
        <label>
          Colour by{" "}
          <select value={colour} onChange={(e) => setColour(e.target.value)}>
            <option value="operation">Operation</option>
            <option value="group">Exercise group</option>
            <option value="revision">Revision status</option>
          </select>
        </label>
        <label>
          Operation{" "}
          <select
            value={operation}
            onChange={(e) => setOperation(e.target.value)}
          >
            <option value="all">All operations</option>
            {[...new Set(rows.map((q) => q.operation))].map((op) => (
              <option key={op}>{op}</option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={revisionsOnly}
            onChange={(e) => setRevisionsOnly(e.target.checked)}
          />{" "}
          Revised only
        </label>
      </div>
      <p className="chart-legend">
        Pale bar: before first input · solid bar: after first input · dashed
        line: trailing five-question median · ◇ unfinished (↑ exceeds scale).
        Selection has a dark outline.
      </p>
      <div className="explorer-svg">
        <svg viewBox="0 0 880 260" role="group" aria-labelledby={chartId}>
          <title id={chartId}>
            Response times by{" "}
            {axis === "elapsed" ? "elapsed time" : "question position"};
            interactive questions, equivalent table below
          </title>
          {[0, 0.5, 1].map((n) => (
            <g key={n}>
              <line
                x1="48"
                x2="840"
                y1={y(n * max)}
                y2={y(n * max)}
                stroke="#e2e8f0"
              />
              <text x="3" y={y(n * max) + 4}>
                {((n * max) / 1000).toFixed(1)}s
              </text>
            </g>
          ))}
          <polyline
            points={rows
              .filter((q) => q.rollingMedianMs !== null)
              .map((q) => `${x(q)},${y(q.rollingMedianMs!)}`)
              .join(" ")}
            fill="none"
            stroke="#64748b"
            strokeDasharray="4 4"
          />
          {visible.map((q) => (
            <g
              key={q.index}
              role="button"
              tabIndex={0}
              aria-label={`Inspect question ${q.index}: ${expression(q)}`}
              onClick={() => {
                setFocus(q.index);
                setSelected([q.index]);
              }}
              onKeyDown={(e) => {
                if (["Enter", " "].includes(e.key)) {
                  e.preventDefault();
                  setFocus(q.index);
                  setSelected([q.index]);
                }
              }}
              className="question-mark"
            >
              {q.totalMs !== null && (
                <>
                  <rect
                    x={x(q) - 4}
                    y={y(q.totalMs)}
                    width="8"
                    height={(q.totalMs / max) * 180}
                    fill={colourFor(q)}
                    opacity="0.3"
                  />
                  <rect
                    x={x(q) - 4}
                    y={y(q.totalMs)}
                    width="8"
                    height={((q.entryMs ?? q.totalMs) / max) * 180}
                    fill={colourFor(q)}
                  />
                </>
              )}
              {q.totalMs !== null && (
                <circle
                  cx={x(q)}
                  cy={y(q.totalMs ?? q.unfinishedMs ?? 0)}
                  r={selected.includes(q.index) ? 6 : 4}
                  fill={q.outcome === "unfinished" ? "white" : colourFor(q)}
                  stroke={selected.includes(q.index) ? "#0f172a" : colourFor(q)}
                  strokeWidth="2"
                />
              )}
              {q.unfinishedMs !== null && (
                <>
                  <path
                    d={`M${x(q)},${y(q.unfinishedMs) - 5}l5,5l-5,5l-5,-5Z`}
                    fill="white"
                    stroke={
                      selected.includes(q.index) ? "#0f172a" : colourFor(q)
                    }
                    strokeWidth="2"
                  />
                  {(q.unfinishedMs > max || q.lowerBound) && (
                    <text x={x(q) + 8} y={y(q.unfinishedMs)}>
                      ↑
                    </text>
                  )}
                </>
              )}
              <title>
                #{q.index} · {expression(q)} ·{" "}
                {seconds(q.totalMs ?? q.unfinishedMs)}
                {q.lowerBound ? " or longer" : ""} · {q.revisionEpisodes}{" "}
                revisions
              </title>
            </g>
          ))}
          <text x="48" y="248">
            {axis === "elapsed" ? "0s" : "Question 1"}
          </text>
          <text x="720" y="248">
            {axis === "elapsed" ? seconds(duration) : `Question ${rows.length}`}
          </text>
        </svg>
      </div>
      <div className="explorer-controls">
        {colourKeys.map((key, i) => (
          <span key={key} style={{ color: colours[i % colours.length] }}>
            ● {key}
          </span>
        ))}
      </div>
      {!rows.length && <p>No questions were presented.</p>}
      <div className="explorer-controls">
        <label>
          From question{" "}
          <input
            aria-label="Selection start"
            type="number"
            min="1"
            max={rows.length}
            value={rangeStart}
            onChange={(e) => setRangeStart(Number(e.target.value))}
          />
        </label>
        <label>
          Through question{" "}
          <input
            aria-label="Selection end"
            type="number"
            min="1"
            max={rows.length}
            value={rangeEnd}
            onChange={(e) => setRangeEnd(Number(e.target.value))}
          />
        </label>
        <button
          className="secondary-button"
          onClick={() =>
            choose(
              visible
                .filter((q) => q.index >= rangeStart && q.index <= rangeEnd)
                .map((q) => q.index),
            )
          }
        >
          Select stretch
        </button>
        <button className="text-button" onClick={() => choose([])}>
          Clear selection
        </button>
      </div>
      {selected.length > 0 && (
        <p role="status">
          {selected.length} selected · {selectionTimes.length} timed completions
          · mean{" "}
          {seconds(
            selectionTimes.length
              ? selectionTimes.reduce((a, b) => a + b, 0) /
                  selectionTimes.length
              : null,
          )}{" "}
          · {visibleSelected.reduce((sum, q) => sum + q.revisionEpisodes, 0)}{" "}
          revision episodes. Rest of run:{" "}
          {seconds(
            (() => {
              const rest = rows.filter(
                (q) => !selected.includes(q.index) && q.totalMs !== null,
              );
              return rest.length
                ? rest.reduce((sum, q) => sum + q.totalMs!, 0) / rest.length
                : null;
            })(),
          )}{" "}
          mean.
        </p>
      )}
      <div className="explorer-controls">
        <button
          className="primary-button"
          disabled={!visibleSelected.length}
          onClick={() => {
            try {
              const config = practiceSelection(visibleSelected);
              setPracticeError("");
              window.dispatchEvent(
                new CustomEvent("arithmetic:practice-selection", {
                  detail: config,
                }),
              );
            } catch (e) {
              setPracticeError((e as Error).message);
            }
          }}
        >
          Create Custom practice from selection
        </button>
        <button
          className="secondary-button"
          disabled={
            !session.mode ||
            session.measurementVersion !== "response-timing-v1" ||
            session.terminationState !== "ended"
          }
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("arithmetic:seed-challenge", { detail: session }),
            )
          }
        >
          Start same-seed challenge
        </button>
      </div>
      <p className="section-help">
        Selection creates editable singleton operand groups in Custom practice;
        review before starting. Same-seed challenges repeat the question
        sequence and are excluded from benchmark comparisons.
      </p>
      {practiceError && <p role="alert">{practiceError}</p>}
      <div className="explorer-columns">
        <div>
          <h3>Run recap & replay reel</h3>
          <p>
            {stats.completed} valid timed completions; {stats.revisedCompleted}{" "}
            revised. {stats.charactersInserted} characters inserted and{" "}
            {stats.charactersRemoved} removed across observed field changes.
          </p>
          {Object.entries(run.reel).map(([key, indices]) => (
            <div className="explorer-controls" key={key}>
              <span>
                {key === "slowest"
                  ? "Largest time contributions"
                  : key === "fastest"
                    ? "Fastest answers"
                    : "Revised questions"}
              </span>
              {indices.map((index) => (
                <button
                  className="reel-button"
                  key={index}
                  onClick={() => choose([index])}
                >
                  #{index}
                </button>
              ))}
              {!indices.length && <span>None observed</span>}
            </div>
          ))}
          <h3>Where the time went</h3>
          {run.timeBreakdown.map((item) => (
            <button
              key={item.label}
              className="breakdown-select"
              onClick={() => choose(item.indices)}
            >
              <span>{item.label}</span>
              <strong>{seconds(item.ms)}</strong>
              <span
                className="time-fill"
                style={{
                  width: `${Math.min(100, ((item.ms || 0) / paceDuration) * 100)}%`,
                }}
              />
            </button>
          ))}
          <p className="section-help">
            Revision time includes thinking. Unfinished time can be a lower
            bound; unattributed time includes gaps or unavailable intervals.
            These are not estimates of wasted time.
          </p>
        </div>
        <div>
          {current && (
            <>
              <Replay question={current} />
              <h3>Question {current.index} · correction label</h3>
              <p>
                {current.revisionEpisodes} revision episodes ·{" "}
                {current.hypothesis} · revision-to-acceptance span{" "}
                {seconds(current.revisionToAcceptanceMs)}.
              </p>
              <p className="section-help">
                Pattern rules flag a one-character difference or a transposition
                edited within 600ms. Uncalibrated hypotheses; unknown is
                retained. Labels below are your own reports.
              </p>
              <label>
                Your label{" "}
                <select
                  aria-label="Correction label"
                  disabled={labelBusy || session.terminationState !== "ended"}
                  value={
                    annotations.find(
                      (a) =>
                        a.presentationSequence === current.presentationSequence,
                    )?.label || "unlabelled"
                  }
                  onChange={(e) => void annotate(e.target.value)}
                >
                  {["unlabelled", "mistyped", "recalculated", "unsure"].map(
                    (label) => (
                      <option key={label}>{label}</option>
                    ),
                  )}
                </select>
              </label>
              {labelError && (
                <p role="alert">
                  {labelError}{" "}
                  <button className="text-button" onClick={onRefresh}>
                    Refresh labels
                  </button>
                </p>
              )}
            </>
          )}
        </div>
      </div>
      <h3>Time splits · completions assigned by acceptance time</h3>
      <div className="split-grid">
        {run.splits.map((split) => (
          <button
            className="split-card"
            key={split.startMs}
            onClick={() => choose(split.indices)}
          >
            <span>
              {seconds(split.startMs)}–{seconds(split.endMs)}
            </span>
            <strong>{split.count} completed</strong>
            <span>
              Median {seconds(split.medianMs)} · {split.revised} revised
            </span>
          </button>
        ))}
      </div>
      <h3>Pace & ghost comparison</h3>
      <div className="explorer-controls">
        <label>
          Compare with{" "}
          <select
            aria-label="Pace comparison"
            value={ghost}
            onChange={(e) => setGhost(e.target.value)}
          >
            <option value="previous">Previous eligible run</option>
            <option value="best">Best eligible run</option>
            <option value="typical">Typical trajectory (median)</option>
            <option value="target">Target pace</option>
            {peers.map((p) => (
              <option key={p.id} value={p.id}>
                {new Date(p.createdAt).toLocaleString()} · {p.score}
              </option>
            ))}
          </select>
        </label>
        {ghost === "target" && (
          <label>
            Target completions{" "}
            <input
              type="number"
              min="0"
              max="100000"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
        )}
      </div>
      <p className="section-help">
        Blue: this run · grey dashed: comparison. Ghosts share the exact cohort
        but contain different random questions. Typical uses {peers.length}{" "}
        other eligible runs; it is a reference curve, not a prediction.
      </p>
      {ghost !== "target" &&
        (contextError ? (
          <p role="alert">
            Comparison data could not load. {contextError}{" "}
            <button
              className="text-button"
              onClick={() => setRetry((n) => n + 1)}
            >
              Retry pace comparison
            </button>
          </p>
        ) : !context ? (
          <p role="status">Loading pace comparisons…</p>
        ) : !hasComparison ? (
          <p role="status">
            {ghost === "previous"
              ? "No earlier eligible run in this exact comparison group."
              : "No other eligible run in this exact comparison group."}{" "}
            Choose Target pace to set a reference.
          </p>
        ) : null)}
      {duration === null && (
        <p role="status">
          The observed duration is unknown; elapsed pace is unavailable.
        </p>
      )}
      <div className="explorer-svg">
        <svg
          viewBox="0 0 880 260"
          role="img"
          aria-label="Cumulative valid completions over elapsed time"
        >
          <line x1="48" x2="840" y1="220" y2="220" stroke="#cbd5e1" />
          <text x="5" y="40">
            {paceMax}
          </text>
          <text x="20" y="220">
            0
          </text>
          <polyline
            points={duration === null ? "" : stepPoints(run)}
            fill="none"
            stroke="#2563eb"
            strokeWidth="3"
          />
          {hasComparison && duration !== null && (
            <polyline
              points={
                peer
                  ? stepPoints(peer.runAnalytics)
                  : plotPace(
                      ghost === "typical"
                        ? medianSteps
                        : [
                            [0, 0],
                            [paceDuration, boundedTarget(target)],
                          ],
                    )
              }
              fill="none"
              stroke="#64748b"
              strokeWidth="2"
              strokeDasharray="6 4"
            />
          )}
          <text x="48" y="248">
            0s
          </text>
          <text x="730" y="248">
            {seconds(duration)}
          </text>
        </svg>
      </div>
      {current?.acceptedMs != null && (
        <p>
          At question {current.index} ({seconds(current.acceptedMs)}):{" "}
          {scoreAt(run, current.acceptedMs)} completions
          {hasComparison
            ? ` · ${(scoreAt(run, current.acceptedMs) - ghostAt(current.acceptedMs)).toFixed(1)} relative to comparison`
            : " · no eligible comparison yet"}
          .
        </p>
      )}
      <details>
        <summary>Show cumulative pace data</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Elapsed</th>
                <th>This run</th>
                <th>Comparison</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(
                { length: duration === null ? 0 : duration === 0 ? 1 : 11 },
                (_, i) => (i * paceDuration) / 10,
              ).map((t) => (
                <tr key={t}>
                  <td>{seconds(t)}</td>
                  <td>{scoreAt(run, t)}</td>
                  <td>{hasComparison ? ghostAt(t).toFixed(1) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <h3>Question details</h3>
      <div className="table-scroll">
        <table>
          <caption>
            Historical baseline matches operation, answer length and operand
            size in earlier eligible runs of this cohort.
          </caption>
          <thead>
            <tr>
              {[
                "Select",
                "Question",
                "Total / first / entry",
                "Δ previous",
                "Δ similar (sample)",
                "Rolling median",
                "Revisions",
                "Input pattern",
              ].map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((q) => {
              const baseline =
                context?.baselines[
                  [q.operation, q.features[1], q.features[4]].join("|")
                ];
              return (
                <tr
                  key={q.index}
                  className={
                    selected.includes(q.index) ? "selected-question" : ""
                  }
                >
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select question ${q.index}`}
                      checked={selected.includes(q.index)}
                      onChange={(e) =>
                        setSelected((v) =>
                          e.target.checked
                            ? [...v, q.index]
                            : v.filter((i) => i !== q.index),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setFocus(q.index)}
                    >
                      #{q.index} · {expression(q)}
                    </button>
                    <small>
                      {q.outcome}
                      {q.lowerBound ? " · lower bound" : ""}
                    </small>
                  </td>
                  <td>
                    {seconds(q.totalMs)} / {seconds(q.firstMs)} /{" "}
                    {seconds(q.entryMs)}
                  </td>
                  <td>{delta(q.deltaMs)}</td>
                  <td>
                    {baseline && q.totalMs !== null
                      ? `${delta(q.totalMs - baseline.medianMs)} (n=${baseline.count})`
                      : "—"}
                  </td>
                  <td>{seconds(q.rollingMedianMs)}</td>
                  <td>{q.revisionEpisodes}</td>
                  <td>{q.hypothesis}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h3>Arithmetic & input profile</h3>
      <p className="section-help">
        This run plus {Math.max(0, (context?.profileSessionCount || 1) - 1)}{" "}
        other eligible runs in the exact cohort. Samples describe observations;
        differences do not establish causes or learning. Select a feature to
        highlight matching questions in this run.
      </p>
      {contextError ? (
        <p role="alert">
          Comparison data could not load: {contextError}{" "}
          <button
            className="text-button"
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry comparisons
          </button>
        </p>
      ) : !context ? (
        <p role="status">Loading comparisons…</p>
      ) : (
        <>
          <label>
            Filter profile{" "}
            <input
              value={profileFilter}
              onChange={(e) => setProfileFilter(e.target.value)}
              placeholder="e.g. carrying, multiplication fact, transition"
            />
          </label>
          <div className="profile-grid">
            {context.profile
              .filter((p) =>
                p.feature.toLowerCase().includes(profileFilter.toLowerCase()),
              )
              .map((p) => (
                <button
                  className="profile-cell"
                  key={p.feature}
                  style={{
                    background: `rgba(37, 99, 235, ${0.025 + Math.min(0.18, (p.medianMs / Math.max(1, max)) * 0.12)})`,
                  }}
                  onClick={() =>
                    choose(
                      rows
                        .filter((q) => q.features.includes(p.feature))
                        .map((q) => q.index),
                    )
                  }
                >
                  <span>{p.feature}</span>
                  <strong>{seconds(p.medianMs)}</strong>
                  <span>
                    n={p.count} · {p.revisedCount} revised
                  </span>
                  <small>
                    First {seconds(p.firstMedianMs)} · entry{" "}
                    {seconds(p.entryMedianMs)}
                  </small>
                </button>
              ))}
          </div>
        </>
      )}
    </section>
  );
}
