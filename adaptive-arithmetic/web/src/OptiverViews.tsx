import { useEffect, useState } from "react";
import type { Question } from "./domain";
import { request } from "./api";
import { displaySeconds, type SavedSession } from "./measurements";
import {
  invalidDateRange,
  recentDateRange,
  updateLocation,
  useLocationParams,
} from "./navigation";

const symbols = {
  addition: "+",
  subtraction: "−",
  multiplication: "×",
  division: "÷",
};
const percent = (n: number | null | undefined) =>
  n == null ? "—" : `${(n * 100).toFixed(1)}%`;
const score = (n: number | null) => (n == null ? "—" : n.toFixed(1));
const date = (s: string) => new Date(s).toLocaleString();

export function MathValue({ value }: { value: string }) {
  const fraction = /^(-?)(?:(\d+) )?(\d+)\/(\d+)$/.exec(value);
  return fraction ? (
    <span className="math-value" role="math" aria-label={value}>
      <span aria-hidden="true">
        {fraction[1]}
        {fraction[2] && <span className="mixed-whole">{fraction[2]}</span>}
        <span className="stacked-fraction">
          <span>{fraction[3]}</span>
          <span>{fraction[4]}</span>
        </span>
      </span>
    </span>
  ) : (
    <span>{value}</span>
  );
}

export function OptiverEquation({
  question: q,
}: {
  question: Pick<Question, "left" | "right" | "operation" | "optiver">;
}) {
  const data = q.optiver;
  if (!data) return null;
  return (
    <span className="optiver-equation">
      {data.blank === "left" ? <span>?</span> : <MathValue value={q.left} />}
      <span>{symbols[q.operation]}</span>
      {data.blank === "right" ? <span>?</span> : <MathValue value={q.right} />}
      <span>=</span>
      {data.blank === "result" ? (
        <span>?</span>
      ) : (
        <MathValue value={data.result} />
      )}
    </span>
  );
}

export function OptiverSummary({
  summary: s,
  partial = false,
}: {
  summary: NonNullable<SavedSession["optiverSummary"]>;
  partial?: boolean;
}) {
  return (
    <section className="optiver-summary" aria-label="Optiver test result">
      <div className="optiver-score-line">
        <strong>
          {s.netScore}
          <span> / 80</span>
        </strong>
        <span className={`optiver-verdict ${s.passed ? "is-pass" : ""}`}>
          {partial
            ? "Partial test"
            : s.passed
              ? "Practice target reached"
              : "Below practice target"}
        </span>
      </div>
      <p className="section-help">
        Net score = correct − incorrect. Practice target: 56. Unanswered
        questions score zero.
      </p>
      <div className="optiver-metrics">
        <div>
          <strong>{s.correct}</strong>
          <span>Correct · +1</span>
        </div>
        <div>
          <strong>{s.incorrect}</strong>
          <span>Incorrect · −1</span>
        </div>
        <div>
          <strong>{s.unanswered}</strong>
          <span>Unanswered · 0</span>
        </div>
        <div>
          <strong>{percent(s.accuracy)}</strong>
          <span>Accuracy · {s.attempted} attempted</span>
        </div>
      </div>
      <p className="section-help">
        All-choice response time: median{" "}
        {displaySeconds(s.medianResponseTimeMs)} · mean{" "}
        {displaySeconds(s.meanResponseTimeMs)} · {s.validResponseCount} valid
        responses. Includes reading and choosing an answer.
      </p>
    </section>
  );
}

export function OptiverReview({ session }: { session: SavedSession }) {
  const [filter, setFilter] = useState("all");
  const questions = session.questions.filter(
    (q) => filter === "all" || q.outcome === filter,
  );
  return (
    <section className="chart-section optiver-review">
      <div className="optiver-section-heading">
        <h2>Answer review</h2>
        <label>
          Show{" "}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Answer review filter"
          >
            <option value="all">All questions</option>
            <option value="incorrect">Incorrect</option>
            <option value="correct">Correct</option>
            <option value="unfinished">Unanswered</option>
          </select>
        </label>
      </div>
      <p className="section-help">
        Every displayed choice and submission is saved. Questions not reached
        before the end are included in the unanswered total.
      </p>
      {!questions.length ? (
        <p className="empty-state">No questions in this selection.</p>
      ) : (
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Optiver answer review"
        >
          <table>
            <thead>
              <tr>
                {[
                  "#",
                  "Question",
                  "Your answer",
                  "Correct answer",
                  "Outcome",
                  "Response time",
                  "Choices",
                ].map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q.presentationSequence}>
                  <td>{(q.index ?? 0) + 1}</td>
                  <td>
                    {q.left != null && q.right != null && q.operation && (
                      <OptiverEquation
                        question={{
                          left: q.left,
                          right: q.right,
                          operation: q.operation,
                          optiver: q.optiver,
                        }}
                      />
                    )}
                  </td>
                  <td>
                    {q.acceptedInput == null ? (
                      "—"
                    ) : (
                      <MathValue value={q.acceptedInput} />
                    )}
                  </td>
                  <td>
                    {q.expected != null && <MathValue value={q.expected} />}
                  </td>
                  <td>
                    <span className={`optiver-outcome ${q.outcome}`}>
                      {q.outcome === "unfinished"
                        ? "Unanswered"
                        : q.outcome === "correct"
                          ? "Correct · +1"
                          : "Incorrect · −1"}
                    </span>
                  </td>
                  <td>{displaySeconds(q.responseTimeMs)}</td>
                  <td>
                    <span className="review-options">
                      {q.optiver?.options.map((value, i) => (
                        <span
                          key={i}
                          className={
                            q.selectedOptionIndex === i ? "chosen" : ""
                          }
                        >
                          <MathValue value={value} />
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function OptiverHome({
  busy,
  onStart,
  onAnalytics,
}: {
  busy: boolean;
  onStart: () => void;
  onAnalytics: () => void;
}) {
  return (
    <main className="saved-page standard-home optiver-home">
      <div className="brand">
        Arithmetic{" "}
        <span className="optiver-mode-label">Assessment practice</span>
      </div>
      <h1>Optiver 80 in 8</h1>
      <p className="lead">
        80 questions. Eight minutes. Make every choice count.
      </p>
      <div className="optiver-facts">
        <div>
          <strong>80</strong>
          <span>questions</span>
        </div>
        <div>
          <strong>8:00</strong>
          <span>time limit</span>
        </div>
        <div>
          <strong>+1 / −1</strong>
          <span>scoring</span>
        </div>
        <div>
          <strong>56</strong>
          <span>practice target</span>
        </div>
      </div>
      <div className="standard-start">
        <button className="primary-button" disabled={busy} onClick={onStart}>
          Start Optiver test
        </button>
        <button className="secondary-button" onClick={onAnalytics}>
          Your Optiver analytics
        </button>
      </div>
      <section className="rules-card">
        <h2>How the test works</h2>
        <ul>
          <li>
            Choose one of four answers. Every choice advances to the next
            question.
          </li>
          <li>
            Integers, decimals, fractions and mixed numbers across all four
            operations. The missing number can appear anywhere in the equation.
          </li>
          <li>
            Correct answers earn one point. Incorrect answers lose one point.
            Unanswered questions score zero.
          </li>
          <li>
            The test ends after 80 answers or eight minutes. The timer keeps
            running when you switch tabs. No calculator.
          </li>
        </ul>
        <p>
          Use the mouse, Tab and Enter, or the number keys 1–4. A new test
          starts immediately; brief green or red feedback follows each choice.
        </p>
        <details>
          <summary>Reference and comparison rules</summary>
          <p>
            Based on the visible{" "}
            <a
              href="https://quantprep.io/mental_math_optiver_intro"
              target="_blank"
              rel="noreferrer"
            >
              QuantPrep 80-in-8 test
            </a>
            , checked 11 November 2026. Each fresh seeded paper follows its
            public trial’s 80-position mix: 29 integer, 27 decimal and 24
            fraction questions, including missing operands. Operands and answer
            options are generated locally.
          </p>
          <p>
            The 56-point practice target follows that reference; it is not a
            verified current Optiver hiring cutoff. This is an independent
            practice mode. Its question bank and scores are not certified as
            identical to an official assessment. Completed tests have their own
            analytics; interrupted tests and repeated-seed challenges are
            excluded from benchmark metrics.
          </p>
        </details>
      </section>
      <p className="section-help">
        Results, answer choices and response times stay in your local database.
        Your Custom settings are remembered separately.
      </p>
    </main>
  );
}

interface ChoiceStats {
  attempted: number;
  correct: number;
  incorrect: number;
  netScore: number;
  accuracy: number | null;
  meanResponseTimeMs: number | null;
  medianResponseTimeMs: number | null;
  validResponseCount: number;
}
interface OptiverData {
  savedRunCount: number;
  excludedRunCount: number;
  statistics: ChoiceStats & {
    runCount: number;
    bestScore: number | null;
    meanScore: number | null;
    passedRuns: number;
    passRate: number | null;
    unanswered: number;
    breakdown: (ChoiceStats & { level: string; label: string })[];
    pace: (ChoiceStats & { minute: number })[];
  };
  runs: Pick<
    SavedSession,
    | "id"
    | "createdAt"
    | "score"
    | "comparisonEligible"
    | "cohortKey"
    | "optiverSummary"
    | "terminationReason"
  >[];
}

export function OptiverAnalytics({
  onBack,
  onDetail,
  onHistory,
}: {
  onBack: () => void;
  onDetail: (id: string) => void;
  onHistory: () => void;
}) {
  const params = useLocationParams(),
    after = params.get("oAfter") || "",
    before = params.get("oBefore") || "";
  const invalid = invalidDateRange(after, before);
  const [data, setData] = useState<OptiverData | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    if (invalid) return;
    const query = new URLSearchParams();
    if (after) query.set("after", after);
    if (before) query.set("before", before);
    void request<OptiverData>("/api/optiver/analytics?" + query)
      .then((result) => {
        if (live) setData(result);
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [after, before, invalid, revision]);
  const stats = data?.statistics,
    full = data?.runs.filter((r) => r.comparisonEligible) || [];
  const rows = [...full].reverse();
  const firstTime = rows.length ? new Date(rows[0].createdAt).valueOf() : 0;
  const lastTime = rows.length
    ? new Date(rows[rows.length - 1].createdAt).valueOf()
    : 0;
  const pointX = (createdAt: string) =>
    50 +
    (lastTime === firstTime
      ? 360
      : ((new Date(createdAt).valueOf() - firstTime) / (lastTime - firstTime)) *
        720);
  return (
    <main className="saved-page optiver-analytics">
      <button className="text-button back-link" onClick={onBack}>
        ← Back to Optiver practice
      </button>
      <header className="saved-heading">
        <div>
          <div className="brand">Optiver 80 in 8</div>
          <h1>Your Optiver analytics</h1>
          <p className="lead">Net scores, accuracy and pace for this mode.</p>
        </div>
        <button
          className="secondary-button"
          onClick={() => setRevision((n) => n + 1)}
        >
          Refresh analytics
        </button>
      </header>
      <div className="optiver-date-controls">
        <label>
          From{" "}
          <input
            type="date"
            value={after}
            onChange={(e) => updateLocation({ oAfter: e.target.value || null })}
          />
        </label>
        <label>
          To{" "}
          <input
            type="date"
            value={before}
            onChange={(e) =>
              updateLocation({ oBefore: e.target.value || null })
            }
          />
        </label>
        {[7, 30].map((days) => (
          <button
            key={days}
            className="secondary-button"
            onClick={() => {
              const range = recentDateRange(days);
              updateLocation({ oAfter: range.after, oBefore: range.before });
            }}
          >
            Last {days} days
          </button>
        ))}
        <button
          className="text-button"
          onClick={() => updateLocation({ oAfter: null, oBefore: null })}
        >
          All time
        </button>
      </div>
      {invalid ? (
        <p role="alert" className="api-error">
          From date must be on or before To date.
        </p>
      ) : error ? (
        <p role="alert" className="api-error">
          Could not load Optiver analytics. {error}
          <button
            className="text-button"
            onClick={() => setRevision((n) => n + 1)}
          >
            Retry analytics
          </button>
        </p>
      ) : !data || !stats ? (
        <p role="status">Loading Optiver analytics…</p>
      ) : (
        <>
          <p className="section-help">
            {stats.runCount} completed tests · {data.excludedRunCount} excluded
            partial or challenge runs. Metrics below use completed tests only.
            Zetamac and Custom results are kept separate.
          </p>
          <div className="optiver-metrics analytics-metrics">
            <div>
              <strong>{stats.bestScore ?? "—"}</strong>
              <span>Best net score / 80</span>
            </div>
            <div>
              <strong>{score(stats.meanScore)}</strong>
              <span>Average net score</span>
            </div>
            <div>
              <strong>{percent(stats.passRate)}</strong>
              <span>
                Practice pass rate · {stats.passedRuns}/{stats.runCount}
              </span>
            </div>
            <div>
              <strong>{percent(stats.accuracy)}</strong>
              <span>Accuracy · {stats.attempted} attempts</span>
            </div>
          </div>
          <p className="section-help">
            {stats.correct} correct · {stats.incorrect} incorrect ·{" "}
            {stats.unanswered} unanswered. Median response:{" "}
            {displaySeconds(stats.medianResponseTimeMs)} · mean:{" "}
            {displaySeconds(stats.meanResponseTimeMs)} across{" "}
            {stats.validResponseCount} valid choices.
          </p>
          {!full.length ? (
            <p className="empty-state">
              {data.savedRunCount
                ? "No completed tests in this date range. Partial tests remain available below."
                : "No tests in this date range. Complete an Optiver test to start tracking your progress."}
            </p>
          ) : (
            <section className="chart-section">
              <h2>Net score over time</h2>
              <p className="section-help">
                Correct − incorrect, from −80 to 80. The dashed line marks the
                56-point practice target. Select a point to review that test.
              </p>
              <svg
                className="optiver-score-chart"
                viewBox="0 0 800 260"
                role="group"
                aria-label="Optiver net score history"
              >
                {[-80, 0, 56, 80].map((n) => {
                  const y = 225 - ((n + 80) / 160) * 200;
                  return (
                    <g key={n}>
                      <line
                        x1="50"
                        x2="770"
                        y1={y}
                        y2={y}
                        className={n === 56 ? "pass-line" : "chart-grid"}
                      />
                      <text x="40" y={y + 4} textAnchor="end">
                        {n}
                      </text>
                    </g>
                  );
                })}
                <polyline
                  className="series-primary"
                  points={rows
                    .map(
                      (r) =>
                        `${pointX(r.createdAt)},${225 - ((r.score + 80) / 160) * 200}`,
                    )
                    .join(" ")}
                />
                {rows.map((r) => (
                  <g
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Review test ${date(r.createdAt)}, net score ${r.score}`}
                    onClick={() => onDetail(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onDetail(r.id);
                      }
                    }}
                  >
                    <circle
                      className="point-hit-area"
                      cx={pointX(r.createdAt)}
                      cy={225 - ((r.score + 80) / 160) * 200}
                      r="12"
                    />
                    <circle
                      className="point-primary"
                      cx={pointX(r.createdAt)}
                      cy={225 - ((r.score + 80) / 160) * 200}
                      r="4"
                    />
                  </g>
                ))}
                <text x="50" y="250">
                  {new Date(rows[0].createdAt).toLocaleDateString()}
                </text>
                <text x="770" y="250" textAnchor="end">
                  {new Date(
                    rows[rows.length - 1].createdAt,
                  ).toLocaleDateString()}
                </text>
              </svg>
            </section>
          )}
          <section className="chart-section">
            <h2>Accuracy and response time</h2>
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Optiver question type performance"
            >
              <table>
                <thead>
                  <tr>
                    {[
                      "Question family",
                      "Attempted",
                      "Correct",
                      "Incorrect",
                      "Accuracy",
                      "Median response",
                    ].map((h) => (
                      <th scope="col" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.breakdown.map((r) => (
                    <tr key={r.level + r.label}>
                      <th scope="row">
                        {r.level === "blank"
                          ? `Missing ${r.label === "result" ? "answer" : r.label + " operand"}`
                          : r.label}
                      </th>
                      <td>{r.attempted}</td>
                      <td>{r.correct}</td>
                      <td>{r.incorrect}</td>
                      <td>{percent(r.accuracy)}</td>
                      <td>{displaySeconds(r.medianResponseTimeMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="chart-section">
            <h2>Pace by minute</h2>
            <p className="section-help">
              Choice submissions pooled across completed tests, grouped by
              elapsed minute. A full-paper pace is 10 questions per minute.
            </p>
            <div className="optiver-pace">
              {stats.pace.map((r) => (
                <div key={r.minute}>
                  <span>{r.minute}m</span>
                  <span className="pace-track">
                    <span
                      style={{
                        width: `${(r.attempted / Math.max(1, ...stats.pace.map((p) => p.attempted))) * 100}%`,
                      }}
                    />
                  </span>
                  <span>
                    {r.attempted} answered · {r.correct} correct · {r.incorrect}{" "}
                    wrong
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="chart-section">
            <div className="optiver-section-heading">
              <h2>Saved tests</h2>
              <button className="text-button" onClick={onHistory}>
                Open filtered history
              </button>
            </div>
            {!data.runs.length ? (
              <p className="empty-state">
                No saved Optiver tests match these dates.
              </p>
            ) : (
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Saved Optiver tests"
              >
                <table>
                  <thead>
                    <tr>
                      {[
                        "Date",
                        "Net score",
                        "Correct / wrong / unanswered",
                        "Accuracy",
                        "Result",
                        "",
                      ].map((h, i) => (
                        <th key={i} scope="col">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.runs.map((r) => (
                      <tr key={r.id}>
                        <td>{date(r.createdAt)}</td>
                        <td>
                          <strong>{r.score}</strong> / 80
                        </td>
                        <td>
                          {r.optiverSummary?.correct} /{" "}
                          {r.optiverSummary?.incorrect} /{" "}
                          {r.optiverSummary?.unanswered}
                        </td>
                        <td>{percent(r.optiverSummary?.accuracy)}</td>
                        <td>
                          {r.comparisonEligible
                            ? r.optiverSummary?.passed
                              ? "Practice target reached"
                              : "Below target"
                            : "Excluded"}
                        </td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => onDetail(r.id)}
                          >
                            Review test
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
