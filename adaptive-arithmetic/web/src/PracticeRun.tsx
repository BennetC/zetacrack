import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  answerMatches,
  type Config,
  type Question,
  type QuestionGenerator,
} from "./domain";
import { request } from "./api";
import { ExportActions } from "./ExportActions";
import { displaySeconds, type SavedSession } from "./measurements";
import {
  hasPracticeFocus,
  JOURNAL_PREFIX,
  terminalOutcome,
  type Observation,
  type SessionOwnership,
  type StartFocusGuard,
} from "./sessionRecovery";
export interface Runtime {
  id: string;
  config: Config;
  seed: string;
  generator: QuestionGenerator;
  firstQuestion: Question;
  ownership: SessionOwnership;
  startFocus: StartFocusGuard;
}
export function PracticeRun({
  runtime,
  onBack,
}: {
  runtime: Runtime;
  onBack: () => void;
}) {
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
    [details, setDetails] = useState(false);
  const [savedResult, setSavedResult] = useState<SavedSession | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [summaryAttempt, setSummaryAttempt] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null),
    origin = useRef<number | null>(null),
    questionRef = useRef(question),
    presented = useRef<string | null>(null);
  const ended = useRef(false),
    log = useRef<Observation[]>([]),
    acknowledged = useRef(0),
    queue = useRef(Promise.resolve()),
    mounted = useRef(false);
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
    record(
      "session-ended",
      {
        reason: outcome.reason,
        wallAt: new Date().toISOString(),
        endTimeKnown: true,
        unfinishedQuestionId:
          presented.current === questionRef.current.id
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
    const blur = () => finish("focus-loss");
    const hidden = () => {
      if (document.visibilityState !== "visible") finish("focus-loss");
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
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leaving);
    // Keep the pending-start guard until the run's listeners are installed.
    runtime.startFocus.dispose();
    if (runtime.startFocus.lost || !hasPracticeFocus()) finish("focus-loss");
    return () => {
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leaving);
    };
  }, [runtime]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
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
    if (!hasPracticeFocus()) {
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
  function change(value: string, inputType: string) {
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
    record("input-changed", { questionId: question.id, value, inputType }, at);
    if (answerMatches(value, question.expected)) {
      record("answer-accepted", { questionId: question.id, value }, at);
      setCompleted((n) => n + 1);
      const next = runtime.generator.next();
      questionRef.current = next;
      setQuestion(next);
      setInput("");
      void flush();
    }
  }
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
    <main className="run-page">
      <header className="run-header">
        <span className="brand">Arithmetic</span>
        <span>
          {runtime.config.session.format === "timed"
            ? `${Math.floor(Math.ceil(seconds) / 60)}:${String(Math.ceil(seconds) % 60).padStart(2, "0")}`
            : "Endless practice"}
        </span>
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
              onChange={(e) =>
                change(
                  e.target.value,
                  (e.nativeEvent as InputEvent).inputType || "input",
                )
              }
            />
          </label>
          <p className="section-help">
            Advances when correct. Leaving this window ends the session.
          </p>
        </section>
      ) : (
        <section className="run-results">
          <h1>Practice complete</h1>
          <p className="section-help">
            {reason === "timeout"
              ? "Time is up."
              : reason === "focus-loss"
                ? "Ended when the window lost focus."
                : "You ended this session."}
          </p>
          <div className="result-metrics">
            <div>
              <strong>
                {savedResult?.summary.correctQuestionCount ?? completed}
              </strong>
              <span>Questions completed</span>
            </div>
            <div>
              <strong>{displaySeconds(elapsed)}</strong>
              <span>Elapsed practice time</span>
            </div>
          </div>
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
            Times include answer entry and edits.
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
            <button className="primary-button" onClick={onBack}>
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
          </div>
          {details && savedResult && (
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
    </main>
  );
}
