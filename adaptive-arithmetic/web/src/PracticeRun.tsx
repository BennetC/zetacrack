import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { answerMatches, type Config, type Question } from "./domain";
import type { QuestionSource } from "./standard";
import { request } from "./api";
import { ExportActions } from "./ExportActions";
import { rememberReloadRestart, clearReloadRestart } from "./reloadRestart";
import { displaySeconds, type SavedSession } from "./measurements";
import { OPTIVER_COUNT, type PlayMode } from "./optiver";
import {
  MathValue,
  OptiverEquation,
  OptiverReview,
  OptiverSummary,
} from "./OptiverViews";
import {
  hasPracticeFocus,
  JOURNAL_PREFIX,
  terminalOutcome,
  type Observation,
  type SessionOwnership,
  type StartFocusGuard,
} from "./sessionRecovery";
export interface Runtime {
  replayOf?: string;
  id: string;
  config: Config;
  seed: string;
  generator: QuestionSource;
  mode?: PlayMode;
  firstQuestion: Question;
  ownership: SessionOwnership;
  startFocus: StartFocusGuard;
}
export function PracticeRun({
  runtime,
  onBack,
  onInspect,
  onGraphs,
  onAgain,
}: {
  runtime: Runtime;
  onBack: () => void;
  onInspect?: (id: string) => void;
  onGraphs?: (cohort: string, includePartial: boolean) => void;
  onAgain?: () => Promise<void>;
}) {
  const isOptiver = runtime.mode === "optiver";
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [netScore, setNetScore] = useState(0);
  const choiceLocked = useRef(false),
    feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<"countdown" | "active" | "ended">(
    runtime.config.session.countdown ? "countdown" : "active",
  );
  const [countdown, setCountdown] = useState(3),
    [question, setQuestion] = useState(runtime.firstQuestion),
    [input, setInput] = useState("");
  const [completed, setCompleted] = useState(0),
    [elapsed, setElapsed] = useState(0),
    [reason, setReason] = useState("");
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error">(
      "saving",
    ),
    [error, setError] = useState(""),
    [journalError, setJournalError] = useState(""),
    [restartStorageError, setRestartStorageError] = useState(""),
    [details, setDetails] = useState(false);
  const [savedResult, setSavedResult] = useState<SavedSession | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [summaryAttempt, setSummaryAttempt] = useState(0);
  const [startingAgain, setStartingAgain] = useState(false);
  const repeatInFlight = useRef(false);
  async function repeat() {
    if (!onAgain || saveState !== "saved" || repeatInFlight.current) return;
    repeatInFlight.current = true;
    setStartingAgain(true);
    try {
      await onAgain();
    } finally {
      repeatInFlight.current = false;
      setStartingAgain(false);
    }
  }
  useEffect(() => {
    if (phase !== "ended" || !onAgain || saveState !== "saved") return;
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key.toLowerCase() === "r" &&
        !event.repeat &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !target?.closest("input,textarea,select,[contenteditable=true]")
      ) {
        event.preventDefault();
        void repeat();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [phase, saveState, onAgain]);
  const inputRef = useRef<HTMLInputElement>(null),
    firstChoiceRef = useRef<HTMLButtonElement>(null),
    origin = useRef<number | null>(null),
    questionRef = useRef(question),
    presented = useRef<string | null>(null);
  const beforeEdit = useRef<Record<string, unknown> | null>(null);
  const lastInput = useRef("");
  const ended = useRef(false),
    log = useRef<Observation[]>([]),
    acknowledged = useRef(0),
    queue = useRef(Promise.resolve()),
    mounted = useRef(false);
  function clearRestart() {
    try {
      clearReloadRestart(runtime.id);
    } catch {
      setRestartStorageError(
        "This tab’s restart information could not be cleared. Browser storage is unavailable.",
      );
    }
  }
  const duration =
    runtime.config.session.format === "timed"
      ? Number(runtime.config.session.durationSeconds) * 1000
      : Infinity;
  useEffect(() => {
    if (saveState !== "saved") return;
    let cancelled = false;
    setSummaryError("");
    void request<SavedSession>("/api/sessions/" + runtime.id)
      .then((result) => {
        if (!cancelled) setSavedResult(result);
      })
      .catch(() => {
        if (!cancelled)
          setSummaryError(
            "The session is saved, but its timing summary could not be loaded.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [saveState, runtime.id, summaryAttempt]);
  const time = () =>
    origin.current === null
      ? 0
      : Math.max(0, performance.now() - origin.current);
  function record(type: string, payload: Record<string, unknown>, at = time()) {
    log.current.push({
      sequence: log.current.length,
      type,
      elapsedMs: at,
      payload,
    });
    try {
      localStorage.setItem(
        JOURNAL_PREFIX + runtime.id,
        JSON.stringify({ id: runtime.id, events: log.current }),
      );
      setJournalError("");
    } catch {
      setJournalError(
        "The browser recovery journal is unavailable. Keep this page open until the database save completes.",
      );
    }
  }
  function flush() {
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        if (acknowledged.current === log.current.length) return;
        const batch = log.current.slice(acknowledged.current),
          length = log.current.length;
        setSaveState("saving");
        try {
          await request(
            "/api/sessions/" + runtime.id + "/observations",
            "POST",
            { events: batch },
          );
          acknowledged.current = length;
          if (ended.current && length === log.current.length) {
            try {
              localStorage.removeItem(JOURNAL_PREFIX + runtime.id);
              setJournalError("");
            } catch {
              setJournalError(
                "The session is saved, but the browser recovery journal could not be cleared.",
              );
            }
            setSaveState("saved");
            setError("");
            runtime.ownership.release();
          }
        } catch (e) {
          setSaveState("error");
          setError(
            "Session data is pending a database save. " + (e as Error).message,
          );
        }
      });
    return queue.current;
  }
  function finish(why: string, at = time()) {
    if (ended.current) return;
    ended.current = true;
    const outcome = terminalOutcome(why, at, duration, origin.current !== null);
    // Blur/hidden often precede pagehide on a browser-toolbar reload. Keep its
    // candidate until focus returns to the ended UI or the user leaves results.
    if (!["focus-loss", "page-exit"].includes(outcome.reason)) clearRestart();
    record(
      "session-ended",
      {
        reason: outcome.reason,
        wallAt: new Date().toISOString(),
        endTimeKnown: true,
        unfinishedQuestionId:
          presented.current === questionRef.current.id &&
          !(isOptiver && choiceLocked.current)
            ? questionRef.current.id
            : null,
      },
      outcome.elapsedMs,
    );
    setElapsed(outcome.elapsedMs);
    setReason(outcome.reason);
    setPhase("ended");
    void flush();
  }
  useLayoutEffect(() => {
    if (!ended.current) {
      try {
        rememberReloadRestart({
          version: 1,
          sessionId: runtime.id,
          mode: runtime.mode || "custom",
          config: runtime.config,
          replayOf: runtime.replayOf ? runtime.id : undefined,
          challengeSeed: runtime.replayOf ? runtime.seed : undefined,
        });
      } catch {
        setRestartStorageError(
          "Automatic restart on reload is unavailable because this tab’s storage could not be saved.",
        );
      }
    }
    const focus = () => {
      if (ended.current) clearRestart();
    };
    const blur = () => {
      if (!isOptiver) finish("focus-loss");
    };
    const hidden = () => {
      if (!isOptiver && document.visibilityState !== "visible")
        finish("focus-loss");
    };
    const leaving = () => {
      finish("page-exit");
      try {
        navigator.sendBeacon(
          "/api/sessions/" + runtime.id + "/observations",
          new Blob([JSON.stringify({ events: log.current })], {
            type: "application/json",
          }),
        );
      } catch {
        /* The journal is retried on the next visit. */
      }
    };
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leaving);
    const navigation = () => finish("navigation");
    window.addEventListener("popstate", navigation);
    // Keep the pending-start guard until the run's listeners are installed.
    runtime.startFocus.dispose();
    if (!isOptiver && (runtime.startFocus.lost || !hasPracticeFocus()))
      finish("focus-loss");
    return () => {
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leaving);
      window.removeEventListener("popstate", navigation);
    };
  }, [runtime]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
      // StrictMode immediately remounts effects. Release only on a real
      // unmount and after every already-enqueued write has settled.
      void queue.current.finally(() => {
        if (!mounted.current) runtime.ownership.release();
      });
    };
  }, [runtime]);
  useLayoutEffect(() => {
    if (
      phase !== "active" ||
      ended.current ||
      presented.current === question.id
    )
      return;
    if (!isOptiver && !hasPracticeFocus()) {
      finish("focus-loss");
      return;
    }
    if (origin.current === null) {
      origin.current = performance.now();
      record("session-started", { wallAt: new Date().toISOString() }, 0);
    }
    const at = time();
    if (at >= duration) {
      finish("timeout");
      return;
    }
    presented.current = question.id;
    record("question-presented", { question }, at);
    inputRef.current?.focus();
    if (isOptiver && hasPracticeFocus())
      firstChoiceRef.current?.focus({ preventScroll: true });
    void flush();
  }, [phase, question]);
  useEffect(() => {
    if (phase !== "countdown") return;
    const timer = setInterval(() => setCountdown((n) => n - 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    if (phase === "countdown" && countdown <= 0) setPhase("active");
  }, [phase, countdown]);
  useEffect(() => {
    if (phase === "ended") return;
    const tick = setInterval(() => {
      if (phase === "active") {
        const at = time();
        if (at >= duration) finish("timeout");
        else setElapsed(at);
      }
      void flush();
    }, 500);
    return () => {
      clearInterval(tick);
    };
  }, [phase]);
  function change(
    value: string,
    inputType: string,
    metadata: Record<string, unknown> = {},
  ) {
    if (
      ended.current ||
      phase !== "active" ||
      presented.current !== question.id
    )
      return;
    const at = time();
    if (at >= duration) {
      finish("timeout");
      return;
    }
    setInput(value);
    record(
      "input-changed",
      {
        questionId: question.id,
        value,
        inputType,
        telemetryVersion: "answer-edits-v2",
        beforeValue: lastInput.current,
        ...beforeEdit.current,
        ...metadata,
      },
      at,
    );
    beforeEdit.current = null;
    lastInput.current = value;
    if (answerMatches(value, question.expected)) {
      record("answer-accepted", { questionId: question.id, value }, at);
      setCompleted((n) => n + 1);
      const next = runtime.generator.next();
      questionRef.current = next;
      setQuestion(next);
      setInput("");
      lastInput.current = "";
      void flush();
    }
  }
  function choose(optionIndex: number) {
    if (
      !isOptiver ||
      ended.current ||
      phase !== "active" ||
      choiceLocked.current ||
      presented.current !== question.id ||
      questionRef.current.id !== question.id ||
      !question.optiver
    )
      return;
    const at = time();
    if (at >= duration) {
      finish("timeout");
      return;
    }
    choiceLocked.current = true;
    const value = question.optiver.options[optionIndex];
    record(
      "answer-submitted",
      { questionId: question.id, optionIndex, value },
      at,
    );
    setSelectedChoice(optionIndex);
    setCompleted((n) => n + 1);
    setNetScore((n) => n + (value === question.expected ? 1 : -1));
    void flush();
    if (question.index + 1 === OPTIVER_COUNT) {
      finish("completed", at);
      return;
    }
    feedbackTimer.current = setTimeout(() => {
      if (ended.current) return;
      if (time() >= duration) {
        finish("timeout");
        return;
      }
      const next = runtime.generator.next();
      questionRef.current = next;
      setQuestion(next);
      setSelectedChoice(null);
      choiceLocked.current = false;
    }, 100);
  }
  useEffect(() => {
    if (!isOptiver || phase !== "active") return;
    const shortcut = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.target instanceof HTMLElement &&
          event.target.closest("input,textarea,select,[contenteditable=true]"))
      )
        return;
      if (/^[1-4]$/.test(event.key)) {
        event.preventDefault();
        choose(Number(event.key) - 1);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [isOptiver, phase, question]);
  const symbols = {
    addition: "+",
    subtraction: "−",
    multiplication: "×",
    division: "÷",
  };
  const seconds = Math.max(
    0,
    (duration === Infinity ? elapsed : duration - elapsed) / 1000,
  );
  return (
    <main
      className={`run-page${isOptiver && phase === "active" ? " optiver-run" : ""}`}
    >
      <header className="run-header">
        <span className="brand">
          {isOptiver ? "Optiver 80 in 8" : "Arithmetic"}
        </span>
        {runtime.replayOf && (
          <span className="section-help">
            Repeated-seed challenge · excluded from benchmarks
          </span>
        )}
        {!(isOptiver && phase === "active") && (
          <span>
            {runtime.config.session.format === "timed"
              ? `${Math.floor(Math.ceil(seconds) / 60)}:${String(Math.ceil(seconds) % 60).padStart(2, "0")}`
              : "Endless practice"}
          </span>
        )}
        {phase !== "ended" && (
          <button
            className="secondary-button"
            onClick={() => finish("manual-end")}
          >
            End session
          </button>
        )}
      </header>
      {phase === "countdown" ? (
        <section className="run-center">
          <p className="section-help">Get ready</p>
          <h1>{countdown}</h1>
          <p>The timer begins with the first question.</p>
        </section>
      ) : phase === "active" && isOptiver ? (
        <section className="run-center">
          <div className="optiver-test-progress">
            <span data-testid="optiver-progress">{completed} / 80</span>
            <span role="timer" aria-label="Time left">
              Time left:{" "}
              {`${Math.floor(Math.ceil(seconds) / 60)
                .toString()
                .padStart(
                  2,
                  "0",
                )}:${String(Math.ceil(seconds) % 60).padStart(2, "0")}`}
            </span>
          </div>
          <div className="optiver-question-card">
            <h1 data-testid="arithmetic-question">
              <OptiverEquation question={question} />
            </h1>
          </div>
          <div
            className="optiver-choices"
            role="group"
            aria-label="Answer choices"
          >
            {question.optiver?.options.map((value, i) => (
              <button
                ref={i === 0 ? firstChoiceRef : undefined}
                key={question.id + ":" + i}
                className={`optiver-choice ${selectedChoice === i ? (value === question.expected ? "correct" : "incorrect") : ""}`}
                disabled={selectedChoice !== null}
                aria-label={`Option ${i + 1}: ${value}`}
                aria-keyshortcuts={String(i + 1)}
                onClick={() => choose(i)}
              >
                <small aria-hidden="true">{i + 1}</small>
                <MathValue value={value} />
              </button>
            ))}
          </div>
          <p className="optiver-feedback" role="status">
            {selectedChoice === null
              ? "Choose an answer · Keys 1–4 · The timer keeps running if you leave this tab."
              : question.optiver?.options[selectedChoice] === question.expected
                ? "Correct · +1 point"
                : "Incorrect · −1 point"}
          </p>
        </section>
      ) : phase === "active" ? (
        <section className="run-center">
          <p className="section-help">{completed} completed</p>
          <h1 className="arithmetic-question" data-testid="arithmetic-question">
            {question.left} {symbols[question.operation]} {question.right}
          </h1>
          <label className="answer-label">
            Your answer
            <input
              ref={inputRef}
              aria-label="Your answer"
              autoComplete="off"
              inputMode="decimal"
              spellCheck={false}
              value={input}
              onBeforeInput={(e) => {
                beforeEdit.current = {
                  selectionStart: e.currentTarget.selectionStart,
                  selectionEnd: e.currentTarget.selectionEnd,
                };
              }}
              onChange={(e) =>
                change(
                  e.target.value,
                  (e.nativeEvent as InputEvent).inputType || "input",
                  {
                    selectionAfterStart: e.target.selectionStart,
                    selectionAfterEnd: e.target.selectionEnd,
                    isComposing:
                      typeof (e.nativeEvent as InputEvent).isComposing ===
                      "boolean"
                        ? (e.nativeEvent as InputEvent).isComposing
                        : null,
                  },
                )
              }
            />
          </label>
          <p className="section-help">
            Advances when correct. Leaving this window ends the session.
          </p>
        </section>
      ) : (
        <section
          className="run-results"
          onClickCapture={clearRestart}
          onKeyDownCapture={clearRestart}
        >
          <h1>
            {isOptiver
              ? "Optiver test complete"
              : runtime.mode === "standard"
                ? "Standard run complete"
                : "Practice complete"}
          </h1>
          <p className="section-help">
            {reason === "timeout"
              ? "Time is up."
              : reason === "completed"
                ? "All 80 questions answered."
                : reason === "focus-loss"
                  ? "Ended when the window lost focus."
                  : "You ended this session."}
          </p>
          {isOptiver &&
            (savedResult?.optiverSummary ? (
              <OptiverSummary
                summary={savedResult.optiverSummary}
                partial={!savedResult.comparisonEligible}
              />
            ) : (
              <p className="lead">
                Net score: {netScore} / 80 · {completed} answered
              </p>
            ))}
          <div className="result-metrics">
            <div>
              <strong>
                {isOptiver
                  ? completed
                  : (savedResult?.summary.correctQuestionCount ?? completed)}
              </strong>
              <span>
                {isOptiver ? "Questions answered" : "Questions completed"}
              </span>
            </div>
            <div>
              <strong>{displaySeconds(elapsed)}</strong>
              <span>Elapsed practice time</span>
            </div>
          </div>
          {savedResult && (
            <p className="section-help">
              {savedResult.scoreState === "full"
                ? isOptiver
                  ? "Completed test"
                  : "Full timed run"
                : "Partial run"}{" "}
              · Score: {savedResult.score}
              {savedResult.scoreState === "partial"
                ? `. ${savedResult.comparisonExclusionReasons.join("; ")}. This score is excluded from full-run comparisons.`
                : "."}
            </p>
          )}
          <div
            className="result-metrics timing-metrics"
            aria-label="Correct-answer timing"
          >
            <div>
              <strong>
                {displaySeconds(savedResult?.summary.medianCorrectAnswerTimeMs)}
              </strong>
              <span>Median correct-answer time</span>
            </div>
            <div>
              <strong>
                {displaySeconds(savedResult?.summary.meanCorrectAnswerTimeMs)}
              </strong>
              <span>Mean correct-answer time</span>
            </div>
          </div>
          <p className="section-help timing-help">
            {isOptiver
              ? "Times include reading and choosing an answer."
              : "Times include answer entry and edits."}
            {savedResult &&
              ` Based on ${savedResult.summary.validCorrectAnswerCount} timed correct ${savedResult.summary.validCorrectAnswerCount === 1 ? "answer" : "answers"}.`}
          </p>
          <p role="status" className="save-status">
            {saveState === "saved"
              ? "Session saved to your local database."
              : saveState === "error"
                ? "Save pending. Your recovery journal is retained."
                : "Saving session…"}
          </p>
          {saveState === "error" && (
            <button className="text-button" onClick={() => void flush()}>
              Retry save
            </button>
          )}
          {saveState === "saved" && !savedResult && !summaryError && (
            <p className="save-status" role="status">
              Loading timing summary…
            </p>
          )}
          {summaryError && (
            <div role="alert" className="api-error">
              <p>{summaryError}</p>
              <button
                className="text-button"
                onClick={() => setSummaryAttempt((n) => n + 1)}
              >
                Retry summary
              </button>
            </div>
          )}
          {savedResult && savedResult.dataQualityWarnings.length > 0 && (
            <ul className="quality-warnings">
              {savedResult.dataQualityWarnings.map((warning, index) => (
                <li key={index}>{warning.message}</li>
              ))}
            </ul>
          )}
          <ExportActions
            sessionId={runtime.id}
            disabled={saveState !== "saved"}
          />
          <div className="result-actions">
            {onAgain && (
              <button
                className="primary-button"
                disabled={saveState !== "saved" || startingAgain}
                aria-keyshortcuts="r"
                onClick={() => void repeat()}
              >
                {startingAgain ? "Starting…" : "Run again"}
              </button>
            )}
            <button className="secondary-button" onClick={onBack}>
              Back to setup
            </button>
            <button
              className="text-button"
              disabled={!savedResult}
              onClick={() => setDetails((v) => !v)}
              aria-expanded={details}
            >
              {details ? "Hide" : "Show"} question details
            </button>
            {onInspect && (
              <button
                className="text-button"
                disabled={!savedResult}
                onClick={() => onInspect(runtime.id)}
              >
                Open saved session
              </button>
            )}
            {onGraphs && (
              <button
                className="text-button"
                disabled={!savedResult}
                onClick={() =>
                  savedResult &&
                  onGraphs(
                    savedResult.cohortKey,
                    !savedResult.comparisonEligible,
                  )
                }
              >
                {isOptiver ? "View Optiver analytics" : "View graphs"}
              </button>
            )}
          </div>
          {onAgain && (
            <p className="section-help">
              Run again with the same settings. Shortcut: R after this session
              is saved.
            </p>
          )}
          {details && savedResult && isOptiver && (
            <OptiverReview session={savedResult} />
          )}
          {details && savedResult && !isOptiver && (
            <ol className="question-review">
              {savedResult.questions.map((q) => {
                return (
                  <li key={q.presentationSequence}>
                    <span>
                      {q.left} {q.operation ? symbols[q.operation] : ""}{" "}
                      {q.right}
                    </span>
                    <div className="question-timing">
                      <span>
                        {q.outcome === "correct"
                          ? `Correct answer: ${displaySeconds(q.correctAnswerTimeMs)}`
                          : `Unfinished: ${q.unfinishedDurationIsLowerBound && q.observedUnfinishedDurationMs !== null ? "at least " : ""}${displaySeconds(q.observedUnfinishedDurationMs)}`}
                      </span>
                      <span>
                        First input: {displaySeconds(q.firstInputTimeMs)}
                      </span>
                      {q.outcome === "unfinished" && q.lastInput !== null && (
                        <span>
                          Last input: <code>{JSON.stringify(q.lastInput)}</code>
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}
      {error && (
        <p className="api-error" role="alert">
          {error}
        </p>
      )}
      {journalError && (
        <p className="api-error" role="alert">
          {journalError}
        </p>
      )}
      {restartStorageError && (
        <p className="api-error" role="alert">
          {restartStorageError}
        </p>
      )}
    </main>
  );
}
