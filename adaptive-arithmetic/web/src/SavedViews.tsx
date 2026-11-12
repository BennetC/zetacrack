import { useEffect, useState } from "react";
import { request } from "./api";
import { ExportActions } from "./ExportActions";
import {
  invalidDateRange,
  recentDateRange,
  updateLocation,
  useLocationParams,
} from "./navigation";
import {
  ObservationCharts,
  FullRunStatistics,
  SequenceChart,
  TrendCharts,
  type Analytics,
} from "./Charts";
import { displaySeconds, type SavedSession } from "./measurements";
import { RunExplorer } from "./RunExplorer";
import { OptiverReview, OptiverSummary } from "./OptiverViews";
import type { RunAnalytics } from "./explorer";
import {
  acquireSessionOwnership,
  JOURNAL_PREFIX,
  type SessionOwnership,
} from "./sessionRecovery";

type FullSession = SavedSession & {
  analysis: Analytics;
  runAnalytics: RunAnalytics;
};
function useRead<T>(url: string | null, revision = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    if (!url) return;
    void request<T>(url)
      .then((value) => {
        if (live) setData(value);
      })
      .catch((e) => {
        if (live)
          setError(`Could not load saved data. ${(e as Error).message}`);
      });
    return () => {
      live = false;
    };
  }, [url, revision, attempt]);
  return { data, error, retry: () => setAttempt((n) => n + 1) };
}
function ReadState({ error, retry }: { error: string; retry: () => void }) {
  return error ? (
    <div className="api-error" role="alert">
      <p>{error}</p>
      <button className="text-button" onClick={retry}>
        Retry loading
      </button>
    </div>
  ) : (
    <p className="save-status" role="status">
      Loading saved data…
    </p>
  );
}
const date = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "Unknown";
const mode = (s: SavedSession) =>
  s.mode === "standard"
    ? "Standard Zetamac"
    : s.mode === "optiver"
      ? "Optiver 80 in 8"
      : s.mode === "custom"
        ? "Custom practice"
        : "Legacy / unspecified";

async function confirmedDelete(
  ids: string[],
  bulk: boolean,
  protectedInDatabase = 0,
  scope = "all local history",
) {
  const locks: SessionOwnership[] = [],
    eligible: string[] = [];
  let protectedCount = protectedInDatabase;
  try {
    for (const id of ids) {
      if (localStorage.getItem(JOURNAL_PREFIX + id) !== null) {
        protectedCount++;
        continue;
      }
      const lock = await acquireSessionOwnership(id);
      if (!lock) {
        protectedCount++;
        continue;
      }
      locks.push(lock);
      // Recheck under ownership: pending data must never be removed or cleared.
      if (localStorage.getItem(JOURNAL_PREFIX + id) !== null) {
        protectedCount++;
        continue;
      }
      eligible.push(id);
    }
    if (!eligible.length)
      throw new Error(
        ids.length
          ? "These sessions have pending data or another page owns them. Keep the recovery journals and retry after saving."
          : "There are no closed sessions to delete.",
      );
    const message = bulk
      ? `Permanently delete these ${eligible.length} closed sessions from ${scope}? ${protectedCount} owned/pending sessions are protected. Presets and your custom setup remain.`
      : "Permanently delete this closed session and its observations? Presets and your custom setup remain.";
    if (!window.confirm(message)) return false;
    await request("/api/sessions", "DELETE", { sessionIds: eligible });
    return true;
  } finally {
    for (const lock of locks) lock.release();
  }
}

export function HistoryView({
  detailId,
  onDetail,
  backLabel = "Back to history",
}: {
  detailId: string | null;
  onDetail: (id: string | null) => void;
  backLabel?: string;
}) {
  const locationParams = useLocationParams();
  const filters = {
    mode: locationParams.get("hMode") || "",
    status: locationParams.get("hStatus") || "",
    after: locationParams.get("hAfter") || "",
    before: locationParams.get("hBefore") || "",
    configuration: locationParams.get("hConfiguration") || "",
  };
  const showNonEligible = locationParams.get("hAll") === "true";
  useEffect(() => {
    if (
      !showNonEligible &&
      (filters.mode === "legacy" ||
        ["ongoing", "incomplete"].includes(filters.status))
    ) {
      updateLocation({ hAll: "true" }, true);
    }
  }, [showNonEligible, filters.mode, filters.status]);
  const rawOffset = Number(locationParams.get("hOffset") || "0");
  const offset =
    Number.isSafeInteger(rawOffset) && rawOffset >= 0
      ? Math.floor(rawOffset / 20) * 20
      : 0;
  const setOffset = (value: number) =>
    updateLocation({ hOffset: value ? String(value) : null }, true);
  const setFilters = (next: typeof filters) => {
    updateLocation(
      Object.fromEntries(
        Object.entries(next).map(([key, value]) => [
          "h" + key[0].toUpperCase() + key.slice(1),
          value || null,
        ]),
      ),
      true,
    );
  };
  const dateError = invalidDateRange(filters.after, filters.before);
  const [revision, setRevision] = useState(0),
    [deleteError, setDeleteError] = useState(""),
    [busy, setBusy] = useState(false);
  const query = new URLSearchParams({
    offset: String(offset),
    limit: "20",
    eligibleOnly: String(!showNonEligible),
  });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const { data, error, retry } = useRead<{
    sessions: SavedSession[];
    total: number;
  }>(dateError ? null : "/api/sessions?" + query, revision);
  const lastOffset = data
    ? Math.floor(Math.max(0, data.total - 1) / 20) * 20
    : offset;
  const pageOutOfRange = offset > lastOffset;
  useEffect(() => {
    // Another tab can delete records while this page is open. Fetch the last
    // existing page instead of presenting an impossible range or false empty state.
    if (data && pageOutOfRange) setOffset(lastOffset);
  }, [data, pageOutOfRange, lastOffset]);
  async function clear(matching = false) {
    setBusy(true);
    setDeleteError("");
    try {
      const preview = await request<{
        sessionIds: string[];
        count: number;
        protectedCount: number;
      }>(
        "/api/sessions/deletion-preview" +
          (matching
            ? "?" +
              new URLSearchParams(
                [...query].filter(
                  ([key]) => !["offset", "limit"].includes(key),
                ),
              )
            : ""),
      );
      if (
        await confirmedDelete(
          preview.sessionIds,
          true,
          preview.protectedCount,
          matching
            ? "the current matching filters across all pages"
            : "all local history, including hidden runs",
        )
      ) {
        setOffset(0);
        setRevision((n) => n + 1);
      }
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (detailId)
    return (
      <SessionDetail
        id={detailId}
        backLabel={backLabel}
        onBack={() => {
          onDetail(null);
          setRevision((n) => n + 1);
        }}
      />
    );
  return (
    <main className="saved-page">
      <header className="saved-heading">
        <div>
          <h1>Session history</h1>
          <p className="lead">
            Your saved practice, with its original settings and observations.
          </p>
        </div>
        <button className="secondary-button" onClick={retry}>
          Refresh history
        </button>
      </header>
      <div className="filter-row">
        <label>
          Mode
          <select
            aria-label="History mode"
            value={filters.mode}
            onChange={(e) => {
              setOffset(0);
              if (e.target.value === "legacy")
                updateLocation({ hAll: "true" }, true);
              setFilters({ ...filters, mode: e.target.value });
            }}
          >
            <option value="">All modes</option>
            <option value="standard">Standard</option>
            <option value="optiver">Optiver 80 in 8</option>
            <option value="custom">Custom</option>
            <option value="legacy">Legacy / unspecified</option>
          </select>
        </label>
        <label>
          State
          <select
            value={filters.status}
            onChange={(e) => {
              setOffset(0);
              if (["ongoing", "incomplete"].includes(e.target.value))
                updateLocation({ hAll: "true" }, true);
              setFilters({ ...filters, status: e.target.value });
            }}
          >
            <option value="">All states</option>
            <option value="ended">Observed end</option>
            <option value="ongoing">Ongoing</option>
            <option value="incomplete">Incomplete / unknown end</option>
          </select>
        </label>
        {(["after", "before"] as const).map((key) => (
          <label key={key}>
            {key === "after" ? "From date (UTC)" : "Through date (UTC)"}
            <input
              type="date"
              value={filters[key]}
              onChange={(e) => {
                setOffset(0);
                setFilters({ ...filters, [key]: e.target.value });
              }}
            />
          </label>
        ))}
        <label>
          Configuration contains
          <input
            type="search"
            placeholder="Operation, group name, range…"
            value={filters.configuration}
            onChange={(e) => {
              setOffset(0);
              setFilters({ ...filters, configuration: e.target.value });
            }}
          />
        </label>
      </div>
      <label className="partial-toggle">
        <input
          type="checkbox"
          checked={showNonEligible}
          onChange={(e) => {
            setOffset(0);
            updateLocation(
              {
                hAll: e.target.checked ? "true" : null,
                hMode:
                  !e.target.checked && filters.mode === "legacy"
                    ? null
                    : filters.mode || null,
                hStatus:
                  !e.target.checked &&
                  ["ongoing", "incomplete"].includes(filters.status)
                    ? null
                    : filters.status || null,
              },
              true,
            );
          }}
        />{" "}
        Show non-eligible runs
      </label>
      <button
        className="text-button"
        onClick={() =>
          updateLocation({
            hMode: null,
            hStatus: null,
            hAfter: null,
            hBefore: null,
            hConfiguration: null,
            hAll: null,
            hOffset: null,
          })
        }
      >
        Clear filters
      </button>
      {dateError ? (
        <p role="alert" className="field-error">
          From date must be on or before Through date.
        </p>
      ) : !data || pageOutOfRange ? (
        <ReadState error={error} retry={retry} />
      ) : (
        <>
          <p className="section-help">
            {data.total} matching sessions · Newest first
          </p>
          {!data.sessions.length ? (
            <p className="empty-state">
              {showNonEligible
                ? "No saved sessions match these filters. Start a run or adjust the filters."
                : "No eligible full runs match these filters. Complete a timed run or turn on Show non-eligible runs to inspect excluded sessions."}
            </p>
          ) : (
            <div className="history-list">
              {data.sessions.map((s) => (
                <article key={s.id} className="history-row">
                  <div>
                    <button
                      className="history-title text-button"
                      onClick={() => onDetail(s.id)}
                    >
                      {mode(s)}
                    </button>
                    <p>{date(s.createdAt)}</p>
                    <small>
                      {s.config.session.format === "timed"
                        ? `${s.config.session.durationSeconds} seconds`
                        : "Endless"}{" "}
                      · {s.terminationState} ·{" "}
                      {s.terminationReason || "No end recorded"}
                    </small>
                  </div>
                  <div className="history-stat">
                    <strong>{s.score}</strong>
                    <span>
                      {s.scoreState === "full"
                        ? "Full-run score"
                        : "Partial count"}
                    </span>
                  </div>
                  <div className="history-stat">
                    <strong>
                      {displaySeconds(s.summary.medianCorrectAnswerTimeMs)}
                    </strong>
                    <span>
                      Median · {s.summary.validCorrectAnswerCount} timed answers
                    </span>
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() => onDetail(s.id)}
                  >
                    View session
                  </button>
                </article>
              ))}
            </div>
          )}
          <div className="pagination">
            <button
              className="secondary-button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 20))}
            >
              Previous page
            </button>
            <span>
              {data.total
                ? `${offset + 1}–${Math.min(offset + 20, data.total)} of ${data.total}`
                : "0 sessions"}
            </span>
            <button
              className="secondary-button"
              disabled={offset + 20 >= data.total}
              onClick={() => setOffset(offset + 20)}
            >
              Next page
            </button>
          </div>
        </>
      )}
      <section className="retention-section">
        <h2>Local data</h2>
        <p>
          Kept locally until you delete them. Ongoing, owned, and pending
          sessions are protected. This app has no third-party tracking or cloud
          synchronization.
        </p>
        <ExportActions />
        <button
          className="secondary-button"
          disabled={busy || !data?.total || dateError}
          onClick={() => void clear(true)}
        >
          Delete matching runs
        </button>
        <button
          className="danger-button"
          disabled={busy}
          onClick={() => void clear()}
        >
          {busy
            ? "Checking deletion scope…"
            : "Delete all closed runs, including hidden runs"}
        </button>
        {deleteError && (
          <p role="alert" className="api-error">
            {deleteError} Retry deletion to check a fresh scope.
          </p>
        )}
      </section>
    </main>
  );
}

export function SessionDetail({
  id,
  onBack,
  backLabel = "Back to history",
}: {
  id: string;
  onBack: () => void;
  backLabel?: string;
}) {
  const { data, error, retry } = useRead<FullSession>(
      "/api/sessions/" + encodeURIComponent(id),
    ),
    [deleteError, setDeleteError] = useState(""),
    [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    setDeleteError("");
    try {
      if (await confirmedDelete([id], false)) onBack();
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="saved-page">
      <button className="text-button back-link" onClick={onBack}>
        ← {backLabel}
      </button>
      {!data ? (
        <ReadState error={error} retry={retry} />
      ) : (
        <>
          <header className="saved-heading">
            <div>
              <h1>{mode(data)}</h1>
              <p className="lead">{date(data.createdAt)}</p>
            </div>
            <button className="secondary-button" onClick={retry}>
              Refresh session
            </button>
          </header>
          <p className="session-state">
            {data.terminationState} ·{" "}
            {data.terminationReason || "No end recorded"} ·{" "}
            {data.scoreState === "full" ? "Full-run score" : "Partial count"}:{" "}
            {data.score}
          </p>
          {data.optiverSummary && (
            <OptiverSummary
              summary={data.optiverSummary}
              partial={!data.comparisonEligible}
            />
          )}
          <p className="section-help">
            {data.comparisonEligible
              ? "Eligible for comparisons within this exact cohort."
              : `Excluded from full-run comparisons: ${data.comparisonExclusionReasons.join("; ")}.`}
          </p>
          <div className="result-metrics timing-metrics">
            <div>
              <strong>
                {displaySeconds(data.summary.medianCorrectAnswerTimeMs)}
              </strong>
              <span>Median correct-answer time</span>
            </div>
            <div>
              <strong>
                {displaySeconds(data.summary.meanCorrectAnswerTimeMs)}
              </strong>
              <span>Mean correct-answer time</span>
            </div>
          </div>
          <p className="section-help">
            {data.summary.validCorrectAnswerCount} valid timed correct answers.
            {data.mode === "optiver"
              ? "Times include reading and choosing an answer."
              : "Times include entry and edits."}
          </p>
          {data.dataQualityWarnings.length > 0 && (
            <ul className="quality-warnings">
              {data.dataQualityWarnings.map((w, i) => (
                <li key={i}>
                  {w.code}: {w.message}
                </li>
              ))}
            </ul>
          )}
          <ExportActions sessionId={id} />
          {data.mode === "optiver" ? (
            <OptiverReview session={data} />
          ) : data.runAnalytics ? (
            <RunExplorer key={id} session={data} onRefresh={retry} />
          ) : (
            <ReadState
              error="Run explorer data is unavailable. Retry loading this session."
              retry={retry}
            />
          )}
          {data.mode !== "optiver" && (
            <>
              <SequenceChart questions={data.questions} />
              <ObservationCharts data={data.analysis} />
              <section className="chart-section">
                <h2>Exact question records</h2>
                <div
                  className="table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Exact questions and raw inputs"
                >
                  <table>
                    <caption>
                      All presented questions; input strings are displayed as
                      JSON to preserve whitespace and empty values.
                    </caption>
                    <thead>
                      <tr>
                        {[
                          "Index / identity",
                          "Operation / group",
                          "Exact question",
                          "Expected",
                          "Outcome",
                          "Accepted input",
                          "Last input",
                          "Edits",
                          "Correct / first input / unfinished",
                        ].map((h) => (
                          <th key={h} scope="col">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.questions.map((q, i) => (
                        <tr key={q.presentationSequence}>
                          <td>
                            {i + 1}
                            <br />
                            <code>{q.id ?? "Unknown"}</code>
                          </td>
                          <td>
                            {q.operation ?? "Unknown"}
                            <br />
                            {q.groupName ?? "Unknown group"}
                            <br />
                            <code>{q.groupId ?? "Unknown identity"}</code>
                          </td>
                          <td>
                            <code>
                              {q.left} {q.operation} {q.right}
                            </code>
                          </td>
                          <td>
                            <code>{q.expected}</code>
                          </td>
                          <td>{q.outcome}</td>
                          <td>
                            <code>
                              {q.acceptedInput === null
                                ? "null"
                                : JSON.stringify(q.acceptedInput)}
                            </code>
                          </td>
                          <td>
                            <code>
                              {q.lastInput === null
                                ? "null"
                                : JSON.stringify(q.lastInput)}
                            </code>
                          </td>
                          <td>{q.inputChangeCount}</td>
                          <td>
                            {displaySeconds(q.correctAnswerTimeMs)} /{" "}
                            {displaySeconds(q.firstInputTimeMs)} /{" "}
                            {q.unfinishedDurationIsLowerBound
                              ? "at least "
                              : ""}
                            {displaySeconds(q.observedUnfinishedDurationMs)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          <section className="chart-section">
            <h2>Original configuration and provenance</h2>
            <dl className="provenance">
              <dt>Session</dt>
              <dd>{data.id}</dd>
              <dt>Mode / content</dt>
              <dd>
                {data.mode ?? "Unknown legacy mode"} /{" "}
                {data.contentVersion ?? "Unknown"}
              </dd>
              <dt>Seed</dt>
              <dd>{data.seed}</dd>
              <dt>Generator / policy</dt>
              <dd>
                {data.generatorVersion} / {data.policyVersion}
              </dd>
              <dt>Measurement</dt>
              <dd>{data.measurementVersion ?? "Unversioned"}</dd>
              <dt>Actual start / end</dt>
              <dd>
                {date(data.startedAt)} / {date(data.endedAt)}
              </dd>
              <dt>Comparison group</dt>
              <dd>{data.cohortLabel}</dd>
            </dl>
            <details>
              <summary>Show original configuration</summary>
              <pre>{JSON.stringify(data.config, null, 2)}</pre>
            </details>
            <details>
              <summary>Show ordered raw events ({data.events.length})</summary>
              <pre>{JSON.stringify(data.events, null, 2)}</pre>
            </details>
          </section>
          <section className="retention-section">
            <p>
              Kept locally until you delete it. Deleting this record leaves
              presets and custom setup intact.
            </p>
            <button
              className="danger-button"
              disabled={busy || data.status !== "ended"}
              onClick={() => void remove()}
            >
              {busy ? "Checking…" : "Delete this session"}
            </button>
            {data.status !== "ended" && (
              <p className="section-help">Ongoing sessions are protected.</p>
            )}
            {deleteError && (
              <p className="api-error" role="alert">
                {deleteError} Use Delete this session to retry.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function SavedSequence({
  id,
  onDetail,
}: {
  id: string;
  onDetail: (id: string) => void;
}) {
  const { data, error, retry } = useRead<FullSession>(
    "/api/sessions/" + encodeURIComponent(id),
  );
  return data ? (
    <>
      {data.mode === "optiver" ? (
        <OptiverReview session={data} />
      ) : (
        <SequenceChart questions={data.questions} />
      )}
      <button className="text-button" onClick={() => onDetail(id)}>
        Inspect this session and its raw records
      </button>
    </>
  ) : (
    <ReadState error={error} retry={retry} />
  );
}
export function GraphsView({
  onDetail,
  initialCohort = "",
  initialIncludePartial = false,
}: {
  onDetail: (id: string) => void;
  initialCohort?: string;
  initialIncludePartial?: boolean;
}) {
  const locationParams = useLocationParams();
  const cohort = locationParams.get("gCohort") || initialCohort;
  const includePartial =
    locationParams.get("gPartial") === "true" || initialIncludePartial;
  const after = locationParams.get("gAfter") || "";
  const before = locationParams.get("gBefore") || "";
  const sequenceId = locationParams.get("gSession") || "";
  const setCohort = (value: string) =>
    updateLocation({ gCohort: value || null });
  const setIncludePartial = (value: boolean) =>
    updateLocation({ gPartial: value ? "true" : null }, true);
  const setAfter = (value: string) =>
    updateLocation({ gAfter: value || null }, true);
  const setBefore = (value: string) =>
    updateLocation({ gBefore: value || null }, true);
  const setSequenceId = (value: string) =>
    updateLocation({ gSession: value || null }, true);
  const dateError = invalidDateRange(after, before);
  const [filtersOpen, setFiltersOpen] = useState(
    () => matchMedia("(min-width: 701px)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(min-width: 701px)");
    const resize = () => setFiltersOpen(media.matches);
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  const params = new URLSearchParams({
    includePartial: String(includePartial),
  });
  if (cohort) params.set("cohort", cohort);
  if (after) params.set("after", after);
  if (before) params.set("before", before);
  const { data, error, retry } = useRead<
    Analytics & {
      sessions: { id: string; createdAt: string; scoreState: string }[];
    }
  >(dateError ? null : "/api/analytics?" + params);
  useEffect(() => {
    if (!cohort && data?.selectedCohortKey)
      updateLocation({ gCohort: data.selectedCohortKey }, true);
  }, [cohort, data?.selectedCohortKey]);
  const selectedSequence = data?.sessions.some((s) => s.id === sequenceId)
    ? sequenceId
    : data?.sessions[0]?.id;
  return (
    <main className="saved-page">
      <header className="saved-heading">
        <div>
          <h1>Practice graphs</h1>
          <p className="lead">
            Describe your saved observations within one comparable setup.
          </p>
        </div>
        <button className="secondary-button" onClick={retry}>
          Refresh graphs
        </button>
      </header>
      <details
        className="graph-filter-panel"
        open={filtersOpen}
        onToggle={(e) => setFiltersOpen(e.currentTarget.open)}
      >
        <summary>Filters and comparison setup</summary>
        <div className="filter-row">
          <label className="cohort-select">
            Comparison group
            <select
              value={cohort || data?.selectedCohortKey || ""}
              disabled={!data?.cohorts.length}
              onChange={(e) => {
                setCohort(e.target.value);
                setSequenceId("");
              }}
            >
              <option value="">Choose a group</option>
              {cohort &&
                !data?.cohorts.some((choice) => choice.key === cohort) && (
                  <option value={cohort}>
                    Selected group has no sessions in this date range
                  </option>
                )}
              {data?.cohorts.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label} ({c.sessionCount} runs)
                </option>
              ))}
            </select>
          </label>
          <label>
            From date (UTC)
            <input
              type="date"
              value={after}
              onChange={(e) => setAfter(e.target.value)}
            />
          </label>
          <label>
            Through date (UTC)
            <input
              type="date"
              value={before}
              onChange={(e) => setBefore(e.target.value)}
            />
          </label>
        </div>
        <label className="partial-toggle">
          <input
            type="checkbox"
            checked={includePartial}
            onChange={(e) => setIncludePartial(e.target.checked)}
          />{" "}
          Include partial / ongoing observations in distribution and breakdown
        </label>
      </details>
      <div className="date-presets" aria-label="Quick date ranges">
        {[7, 30, 90].map((days) => {
          const range = recentDateRange(days);
          return (
            <button
              key={days}
              className="secondary-button"
              aria-pressed={after === range.after && before === range.before}
              onClick={() =>
                updateLocation(
                  { gAfter: range.after, gBefore: range.before },
                  true,
                )
              }
            >
              Last {days} days
            </button>
          );
        })}
        <button
          className="secondary-button"
          aria-pressed={!after && !before}
          onClick={() => updateLocation({ gAfter: null, gBefore: null }, true)}
        >
          All dates
        </button>
        {(after || before) && (
          <button
            className="text-button"
            onClick={() =>
              updateLocation({ gAfter: null, gBefore: null }, true)
            }
          >
            Clear filters
          </button>
        )}
      </div>
      <p className="active-filters" aria-label="Active graph filters">
        {after || "All earlier dates"} → {before || "Latest date"} ·{" "}
        {includePartial
          ? "Partial observations included"
          : "Eligible full runs"}
      </p>
      <details className="graph-methodology">
        <summary>How comparisons work</summary>
        <p className="section-help">
          Score and timing chronology always use eligible full timed runs.
          Modes, original configurations, duration, generator, policy and
          measurement versions remain separate. Names and group identities are
          conservatively kept in the comparison key. On small screens, charts
          scroll horizontally. Every plot has an equivalent data table.
        </p>
      </details>
      {dateError ? (
        <p role="alert" className="field-error">
          From date must be on or before Through date. Clear filters or adjust
          the dates.
        </p>
      ) : !data ? (
        <ReadState error={error} retry={retry} />
      ) : (
        <>
          {data.selectedSessionCount === 0 && (
            <p className="empty-state">
              {data.totalSavedSessionCount === 0
                ? "No saved history yet. Complete a run to see real observations here."
                : "No runs match these dates and comparison setup. Clear filters or choose another setup."}
            </p>
          )}
          <FullRunStatistics
            data={data.fullRunStatistics}
            choiceMode={
              data.cohorts.find((c) => c.key === data.selectedCohortKey)
                ?.mode === "optiver"
            }
          />
          <p className="cohort-summary">
            {data.selectedSessionCount} saved sessions ·{" "}
            {data.eligibleSessionCount} eligible full runs ·{" "}
            {data.excludedSessionCount} excluded
          </p>
          {Object.keys(data.exclusionReasons).length > 0 && (
            <details>
              <summary>Why runs are excluded</summary>
              <ul>
                {Object.entries(data.exclusionReasons).map(
                  ([reason, count]) => (
                    <li key={reason}>
                      {reason}: {count}
                    </li>
                  ),
                )}
              </ul>
            </details>
          )}
          <TrendCharts data={data} onDetail={onDetail} />
          <ObservationCharts data={data} />
          <section className="sequence-selection">
            <label>
              Session for response sequence
              <select
                value={selectedSequence || ""}
                disabled={!data.sessions.length}
                onChange={(e) => setSequenceId(e.target.value)}
              >
                <option value="">Choose a saved session</option>
                {data.sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {date(s.createdAt)} · {s.scoreState} · {s.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            {selectedSequence ? (
              <SavedSequence id={selectedSequence} onDetail={onDetail} />
            ) : (
              <p className="empty-state">
                No sessions in this observation selection. Include partial
                observations to inspect an interrupted run.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
