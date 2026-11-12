import { useId, useState } from "react";
import type { DerivedQuestion, SavedSession } from "./measurements";
import { displaySeconds } from "./measurements";

export interface Analytics {
  totalSavedSessionCount: number;
  cohorts: {
    key: string;
    label: string;
    mode: string | null;
    sessionCount: number;
    eligibleSessionCount: number;
  }[];
  selectedCohortKey: string | null;
  selectedSessionCount: number;
  eligibleSessionCount: number;
  excludedSessionCount: number;
  exclusionReasons: Record<string, number>;
  includePartialObservations: boolean;
  observationSessionCount: number;
  summary: SavedSession["summary"];
  fullRunStatistics: {
    runCount: number;
    meanScore: number | null;
    medianScore: number | null;
    bestScore: number | null;
    recentRunCount: number;
    recentMeanScore: number | null;
    previousRunCount: number;
    previousMeanScore: number | null;
    recentScoreDifference: number | null;
    answerSummary: SavedSession["summary"];
    runTiming: {
      contributingRunCount: number;
      meanRunMeanMs: number | null;
      medianRunMeanMs: number | null;
      meanRunMedianMs: number | null;
      medianRunMedianMs: number | null;
    };
  };
  histogram: {
    lowerMs: number;
    upperMs: number;
    upperInclusive: boolean;
    count: number;
  }[];
  breakdown: ({
    level: string;
    label: string;
    operation: string | null;
    groupId: string | null;
  } & SavedSession["summary"])[];
  trend: ({
    sessionId: string;
    createdAt: string;
    score: number;
  } & SavedSession["summary"])[];
}
const X = 58,
  Y = 20,
  W = 600,
  H = 190;
const date = (value: string) => new Date(value).toLocaleString();
const tick = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });
export function FullRunStatistics({
  data,
  choiceMode = false,
}: {
  data: Analytics["fullRunStatistics"];
  choiceMode?: boolean;
}) {
  const score = (value: number | null) =>
    value == null ? "—" : value.toFixed(2);
  const timings = data.runTiming;
  return (
    <section className="full-run-statistics" aria-label="Full-run statistics">
      <h2>Full-run statistics</h2>
      <p className="section-help">
        Eligible full runs in the selected comparison group and date range.
        {choiceMode
          ? "Net score is correct minus incorrect. Times include reading and choosing an answer."
          : "Times include answer entry and edits."}
      </p>
      <div className="statistics-grid">
        <section>
          <h3>Scores</h3>
          <p className="section-help">{data.runCount} eligible full runs</p>
          <dl className="numeric-summary">
            <div>
              <dt>Average score</dt>
              <dd>{score(data.meanScore)}</dd>
            </div>
            <div>
              <dt>Median score</dt>
              <dd>{score(data.medianScore)}</dd>
            </div>
            <div>
              <dt>Best score</dt>
              <dd>{score(data.bestScore)}</dd>
            </div>
            <div>
              <dt>Latest {data.recentRunCount} runs average</dt>
              <dd>{score(data.recentMeanScore)}</dd>
            </div>
          </dl>
        </section>
        <section>
          <h3>Answer times</h3>
          <p className="section-help">
            {data.answerSummary.validCorrectAnswerCount} valid correct answers ·
            Each answer has equal weight
          </p>
          <dl className="numeric-summary">
            <div>
              <dt>Average answer time</dt>
              <dd>
                {displaySeconds(data.answerSummary.meanCorrectAnswerTimeMs)}
              </dd>
            </div>
            <div>
              <dt>Median answer time</dt>
              <dd>
                {displaySeconds(data.answerSummary.medianCorrectAnswerTimeMs)}
              </dd>
            </div>
          </dl>
        </section>
      </div>
      <p className="recent-comparison" aria-label="Recent score comparison">
        {data.previousRunCount
          ? `Latest ${data.recentRunCount} runs: ${score(data.recentMeanScore)} average · Previous ${data.previousRunCount}: ${score(data.previousMeanScore)} · Change: ${(data.recentScoreDifference ?? 0) > 0 ? "+" : ""}${score(data.recentScoreDifference)} ${choiceMode ? "points" : "questions"}.`
          : `No previous comparison block yet. This selection has ${data.recentRunCount} of up to 10 recent runs.`}{" "}
        Describes these runs; it does not establish learning benefit.
      </p>
      <h3>Run-level timing</h3>
      <p className="section-help">
        {timings.contributingRunCount} runs with valid timings · Each run has
        equal weight
      </p>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Run-level timing statistics"
      >
        <table>
          <caption>Average and median of each run’s timing summary</caption>
          <thead>
            <tr>
              <th scope="col">Per-run measure</th>
              <th scope="col">Average</th>
              <th scope="col">Median</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Average answer time</th>
              <td>{displaySeconds(timings.meanRunMeanMs)}</td>
              <td>{displaySeconds(timings.medianRunMeanMs)}</td>
            </tr>
            <tr>
              <th scope="row">Median answer time</th>
              <td>{displaySeconds(timings.meanRunMedianMs)}</td>
              <td>{displaySeconds(timings.medianRunMedianMs)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Frame({
  title,
  unit,
  max,
  min = 0,
  labels,
  children,
  interactive = false,
}: {
  title: string;
  unit: string;
  max: number;
  min?: number;
  labels: [number, string][];
  children: React.ReactNode;
  interactive?: boolean;
}) {
  const id = useId();
  return (
    <div className="chart-frame">
      <p className="chart-scroll-cue">
        Scroll horizontally to view the full chart, or open its data table.
      </p>
      <div
        className="chart-scroll"
        tabIndex={0}
        role="region"
        aria-label={`${title}, horizontally scrollable on small screens`}
      >
        <svg
          viewBox="0 0 700 265"
          className="data-chart"
          role={interactive ? "group" : "img"}
          aria-labelledby={id}
        >
          <title id={id}>
            {title}. Vertical axis: {unit}. Data are also available in the
            following table.
          </title>
          <text x={X} y={12} className="axis-label">
            {unit}
          </text>
          {[0, 0.5, 1].map((ratio) => (
            <g key={ratio}>
              <line
                x1={X}
                x2={X + W}
                y1={Y + H * (1 - ratio)}
                y2={Y + H * (1 - ratio)}
                className="chart-grid"
              />
              <text x={X - 8} y={Y + H * (1 - ratio) + 4} textAnchor="end">
                {tick(min + (max - min) * ratio)}
              </text>
            </g>
          ))}
          {labels.map(([x, label], i) => (
            <text key={i} x={x} y={Y + H + 22} textAnchor="middle">
              {label}
            </text>
          ))}
          {children}
        </svg>
      </div>
    </div>
  );
}
function Table({
  headers,
  rows,
  caption,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  caption: string;
}) {
  return (
    <details className="chart-table">
      <summary>Show data table: {caption}</summary>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label={caption}
      >
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
export function TrendCharts({
  data,
  onDetail,
}: {
  data: Analytics;
  onDetail: (id: string) => void;
}) {
  const rows = data.trend;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find((row) => row.sessionId === selectedId);
  const activate = (row: Analytics["trend"][number]) => ({
    tabIndex: 0,
    role: "button",
    "aria-label": `Inspect run from ${date(row.createdAt)}, score ${row.score}, median ${displaySeconds(row.medianCorrectAnswerTimeMs)}, mean ${displaySeconds(row.meanCorrectAnswerTimeMs)}`,
    onClick: () => setSelectedId(row.sessionId),
    onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setSelectedId(row.sessionId);
      }
    },
  });
  const first = rows.length ? new Date(rows[0].createdAt).valueOf() : 0;
  const last = rows.length
    ? new Date(rows[rows.length - 1].createdAt).valueOf()
    : 0;
  const x = (at: string) =>
    X +
    (last === first
      ? W / 2
      : ((new Date(at).valueOf() - first) / (last - first)) * W);
  const labels: [number, string][] = rows.length
    ? last === first
      ? [[X + W / 2, new Date(rows[0].createdAt).toLocaleDateString()]]
      : [
          [X, new Date(rows[0].createdAt).toLocaleDateString()],
          [
            X + W,
            new Date(rows[rows.length - 1].createdAt).toLocaleDateString(),
          ],
        ]
    : [];
  const scoreMax = Math.max(1, ...rows.map((r) => r.score));
  const scoreMin = Math.min(0, ...rows.map((r) => r.score));
  const scoreY = (value: number) =>
    Y + H - ((value - scoreMin) / (scoreMax - scoreMin)) * H;
  const timeMax = Math.max(
    0.02,
    ...rows
      .flatMap((r) => [r.medianCorrectAnswerTimeMs, r.meanCorrectAnswerTimeMs])
      .filter((n): n is number => n != null)
      .map((n) => n / 1000),
  );
  return (
    <section className="chart-section">
      <h2>Comparable full-run history</h2>
      <p className="section-help">
        {rows.length} full timed runs in this comparison group. Dates use your
        device's time zone. Interrupted runs never enter score trends.
      </p>
      {!rows.length ? (
        <p className="empty-state">
          No eligible full timed runs yet. Saved partial observations can still
          be inspected below.
        </p>
      ) : (
        <>
          <h3>Score over time</h3>
          {selected && (
            <div className="point-inspector" role="status">
              <p>
                {date(selected.createdAt)} · Score {selected.score} · Median{" "}
                {displaySeconds(selected.medianCorrectAnswerTimeMs)} · Mean{" "}
                {displaySeconds(selected.meanCorrectAnswerTimeMs)}
              </p>
              <button
                className="text-button"
                onClick={() => onDetail(selected.sessionId)}
              >
                Open selected session
              </button>
            </div>
          )}
          <Frame
            interactive
            title="Full-run score chronology"
            unit={
              data.cohorts.find((c) => c.key === data.selectedCohortKey)
                ?.mode === "optiver"
                ? "Net points"
                : "Questions completed"
            }
            max={scoreMax}
            min={scoreMin}
            labels={labels}
          >
            <polyline
              points={rows
                .map((r) => `${x(r.createdAt)},${scoreY(r.score)}`)
                .join(" ")}
              className="series-primary"
            />
            {rows.map((r) => (
              <g
                key={r.sessionId}
                className="interactive-point"
                {...activate(r)}
              >
                <circle
                  className="point-hit-area"
                  cx={x(r.createdAt)}
                  cy={scoreY(r.score)}
                  r={12}
                />
                <circle
                  cx={x(r.createdAt)}
                  cy={scoreY(r.score)}
                  r={4}
                  className="point-primary"
                >
                  <title>
                    {date(r.createdAt)}: score {r.score}
                  </title>
                </circle>
              </g>
            ))}
          </Frame>
          <h3>Correct-answer time over time</h3>
          {rows.every((row) => row.validCorrectAnswerCount === 0) && (
            <p className="empty-state">
              No valid correct-answer times in these full runs.
            </p>
          )}
          <p className="chart-legend">● Median · □ Mean</p>
          <Frame
            interactive
            title="Median and mean correct-answer time chronology"
            unit="Seconds"
            max={timeMax}
            labels={labels}
          >
            {(
              ["medianCorrectAnswerTimeMs", "meanCorrectAnswerTimeMs"] as const
            ).map((key, i) => (
              <g key={key}>
                {rows.map((r) =>
                  r[key] == null ? null : (
                    <g
                      key={r.sessionId}
                      className="interactive-point"
                      {...activate(r)}
                    >
                      <circle
                        className="point-hit-area"
                        cx={x(r.createdAt)}
                        cy={Y + H - (r[key]! / 1000 / timeMax) * H}
                        r={12}
                      />
                      {i === 0 ? (
                        <circle
                          key={r.sessionId}
                          cx={x(r.createdAt)}
                          cy={Y + H - (r[key]! / 1000 / timeMax) * H}
                          r={4}
                          className="point-primary"
                        >
                          <title>
                            {date(r.createdAt)}: median {displaySeconds(r[key])}
                          </title>
                        </circle>
                      ) : (
                        <rect
                          key={r.sessionId}
                          x={x(r.createdAt) - 4}
                          y={Y + H - (r[key]! / 1000 / timeMax) * H - 4}
                          width={8}
                          height={8}
                          className="point-secondary"
                        >
                          <title>
                            {date(r.createdAt)}: mean {displaySeconds(r[key])}
                          </title>
                        </rect>
                      )}
                    </g>
                  ),
                )}
              </g>
            ))}
          </Frame>
        </>
      )}
      <Table
        caption="Full-run chronology"
        headers={[
          "Session date",
          "Score",
          "Median",
          "Mean",
          "Valid answers",
          "Inspect",
        ]}
        rows={rows.map((r) => [
          date(r.createdAt),
          r.score,
          displaySeconds(r.medianCorrectAnswerTimeMs),
          displaySeconds(r.meanCorrectAnswerTimeMs),
          r.validCorrectAnswerCount,
          <button className="text-button" onClick={() => onDetail(r.sessionId)}>
            Open session
          </button>,
        ])}
      />
    </section>
  );
}
export function ObservationCharts({ data }: { data: Analytics }) {
  const bins = data.histogram,
    max = Math.max(1, ...bins.map((b) => b.count));
  const maxTime = Math.max(
    0.02,
    ...data.breakdown
      .flatMap((r) => [r.meanCorrectAnswerTimeMs, r.medianCorrectAnswerTimeMs])
      .filter((v): v is number => v != null)
      .map((v) => v / 1000),
  );
  return (
    <>
      <section className="chart-section">
        <h2>Correct-answer time distribution</h2>
        <p className="section-help">
          {data.summary.validCorrectAnswerCount} valid timed correct answers
          from {data.observationSessionCount} sessions. Bins include their lower
          edge; only the final bin includes its upper edge. Missing and invalid
          timings are excluded.
        </p>
        {!bins.length ? (
          <p className="empty-state">
            No valid correct-answer times in this selection.
          </p>
        ) : (
          <Frame
            title="Correct-answer time histogram"
            unit="Answers"
            max={max}
            labels={bins.map((b, i) => [
              X + ((i + 0.5) * W) / bins.length,
              tick(b.lowerMs / 1000),
            ])}
          >
            <text x={X + W / 2} y={258} textAnchor="middle">
              Correct-answer time (seconds; lower bin edge)
            </text>
            {bins.map((b, i) => (
              <rect
                key={i}
                x={X + (i * W) / bins.length + 3}
                y={Y + H - (b.count / max) * H}
                width={W / bins.length - 6}
                height={(b.count / max) * H}
                className="histogram-bar"
              >
                <title>
                  {b.lowerMs}–{b.upperMs} ms: {b.count} answers
                </title>
              </rect>
            ))}
          </Frame>
        )}
        <Table
          caption="Response-time bins"
          headers={[
            "Lower (ms, included)",
            "Upper (ms)",
            "Upper included?",
            "Answers",
          ]}
          rows={bins.map((b) => [
            String(b.lowerMs),
            String(b.upperMs),
            b.upperInclusive ? "Yes" : "No",
            b.count,
          ])}
        />
      </section>
      <section className="chart-section">
        <h2>Operation and group breakdown</h2>
        <p className="section-help">
          Descriptive response times include entry and edits. Samples describe
          these observations; differences do not establish difficulty or
          learning benefit.
        </p>
        <p className="chart-legend">
          Solid bar: median · Striped bar: mean. Shared scale: 0–{tick(maxTime)}{" "}
          seconds.
        </p>
        {["operation", "group"].map((level) => {
          const records = data.breakdown.filter((r) => r.level === level);
          return (
            <div key={level}>
              <h3>
                {level === "operation" ? "Operations" : "Exercise groups"}
              </h3>
              {!records.length ? (
                <p className="empty-state">
                  No {level} observations available.
                </p>
              ) : (
                <div
                  className="breakdown-plot"
                  role="img"
                  aria-label={`${level} median and mean correct-answer times in seconds; equivalent table follows`}
                >
                  {records.map((r, i) => (
                    <div className="breakdown-row" key={i}>
                      <span>
                        {r.label}
                        <small>
                          {r.validCorrectAnswerCount} timed correct answers
                        </small>
                      </span>
                      <div className="bar-pair">
                        <div
                          className="median-bar"
                          style={{
                            width:
                              r.medianCorrectAnswerTimeMs == null
                                ? "0"
                                : `${(r.medianCorrectAnswerTimeMs / 1000 / maxTime) * 100}%`,
                          }}
                        />
                        <div
                          className="mean-bar"
                          style={{
                            width:
                              r.meanCorrectAnswerTimeMs == null
                                ? "0"
                                : `${(r.meanCorrectAnswerTimeMs / 1000 / maxTime) * 100}%`,
                          }}
                        />
                      </div>
                      <span>
                        Median {displaySeconds(r.medianCorrectAnswerTimeMs)}
                        <small>
                          Mean {displaySeconds(r.meanCorrectAnswerTimeMs)}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <Table
                caption={`${level} breakdown`}
                headers={[
                  "Operation",
                  "Group identity",
                  "Name",
                  "Presented",
                  "Correct",
                  "Unfinished",
                  "Valid times",
                  "Median",
                  "Mean",
                ]}
                rows={records.map((r) => [
                  r.operation ?? "Unknown",
                  r.groupId ?? "—",
                  r.label,
                  r.presentedQuestionCount,
                  r.correctQuestionCount,
                  r.unfinishedQuestionCount,
                  r.validCorrectAnswerCount,
                  displaySeconds(r.medianCorrectAnswerTimeMs),
                  displaySeconds(r.meanCorrectAnswerTimeMs),
                ])}
              />
            </div>
          );
        })}
      </section>
    </>
  );
}
export function SequenceChart({ questions }: { questions: DerivedQuestion[] }) {
  const max = Math.max(
    0.02,
    ...questions
      .flatMap((q) => [q.correctAnswerTimeMs, q.firstInputTimeMs])
      .filter((v): v is number => v != null)
      .map((v) => v / 1000),
  );
  const x = (i: number) =>
    X +
    (questions.length === 1
      ? W / 2
      : (i / Math.max(1, questions.length - 1)) * W);
  const y = (ms: number) => Y + H - (ms / 1000 / max) * H;
  const unfinishedMax = Math.max(
    0.02,
    ...questions
      .map((q) => q.observedUnfinishedDurationMs)
      .filter((v): v is number => v != null)
      .map((v) => v / 1000),
  );
  const unfinishedY = (ms: number) => Y + H - (ms / 1000 / unfinishedMax) * H;
  const labels: [number, string][] = questions.length
    ? [
        [x(0), "1"],
        ...(questions.length > 1
          ? [
              [x(questions.length - 1), String(questions.length)] as [
                number,
                string,
              ],
            ]
          : []),
      ]
    : [];
  return (
    <section className="chart-section">
      <h2>Within-session response sequence</h2>
      <p className="section-help">
        ● Correct answer · × First input · ◇ Unfinished observation (↑ means a
        lower bound). Missing timings have no plotted point.
      </p>
      {questions.some(
        (q) => q.correctAnswerTimeMs !== null || q.firstInputTimeMs !== null,
      ) ? (
        <Frame
          title="Correct-answer and first-input times by question presentation index"
          unit="Seconds"
          max={max}
          labels={labels}
        >
          <text x={X + W / 2} y={258} textAnchor="middle">
            Presentation index
          </text>
          {questions.map((q, i) => (
            <g key={q.presentationSequence}>
              {q.correctAnswerTimeMs != null && (
                <circle
                  cx={x(i)}
                  cy={y(q.correctAnswerTimeMs)}
                  r={4}
                  className="point-primary"
                >
                  <title>
                    {q.id}: correct {displaySeconds(q.correctAnswerTimeMs)}
                  </title>
                </circle>
              )}
              {q.firstInputTimeMs != null && (
                <path
                  d={`M${x(i) - 4},${y(q.firstInputTimeMs) - 4}l8,8m-8,0l8,-8`}
                  className="series-secondary"
                >
                  <title>
                    {q.id}: first input {displaySeconds(q.firstInputTimeMs)}
                  </title>
                </path>
              )}
            </g>
          ))}
        </Frame>
      ) : (
        <p className="empty-state">
          {questions.length
            ? "No valid correct-answer or first-input times are available."
            : "No questions were presented in this session."}
        </p>
      )}
      {questions.some((q) => q.observedUnfinishedDurationMs !== null) && (
        <>
          <h3>Unfinished observations</h3>
          <p className="section-help">
            A separate seconds scale preserves visibility of completed response
            times. ◇ observed duration; ↑ observed lower bound when the actual
            end is unknown.
          </p>
          <Frame
            title="Unfinished observations by presentation index"
            unit="Seconds (unfinished)"
            max={unfinishedMax}
            labels={labels}
          >
            <text x={X + W / 2} y={258} textAnchor="middle">
              Presentation index
            </text>
            {questions.map((q, i) =>
              q.observedUnfinishedDurationMs == null ? null : (
                <g key={q.presentationSequence}>
                  <path
                    d={`M${x(i)},${unfinishedY(q.observedUnfinishedDurationMs) - 5}l5,5l-5,5l-5,-5Z`}
                    className="unfinished-point"
                  >
                    <title>
                      {q.id}: unfinished{" "}
                      {q.unfinishedDurationIsLowerBound ? "at least " : ""}
                      {displaySeconds(q.observedUnfinishedDurationMs)}
                    </title>
                  </path>
                  {q.unfinishedDurationIsLowerBound && (
                    <text
                      x={x(i) + 7}
                      y={unfinishedY(q.observedUnfinishedDurationMs)}
                    >
                      ↑
                    </text>
                  )}
                </g>
              ),
            )}
          </Frame>
        </>
      )}
      <Table
        caption="Question timing sequence"
        headers={[
          "Index",
          "Question / group",
          "Outcome",
          "Correct",
          "First input",
          "Unfinished",
          "Lower bound?",
        ]}
        rows={questions.map((q, i) => [
          i + 1,
          `${q.id ?? "Unknown"} / ${q.groupId ?? "Unknown"}: ${q.left} ${q.operation} ${q.right}`,
          q.outcome,
          displaySeconds(q.correctAnswerTimeMs),
          displaySeconds(q.firstInputTimeMs),
          displaySeconds(q.observedUnfinishedDurationMs),
          q.unfinishedDurationIsLowerBound == null
            ? "—"
            : q.unfinishedDurationIsLowerBound
              ? "Yes"
              : "No",
        ])}
      />
    </section>
  );
}
