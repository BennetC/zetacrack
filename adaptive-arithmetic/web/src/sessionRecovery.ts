import { ApiError, request } from "./api";
import { CREATION_PREFIX, readCreation } from "./sessionCreation";

export interface Observation {
  sequence: number;
  type: string;
  elapsedMs: number;
  payload: Record<string, unknown>;
}
export const JOURNAL_PREFIX = "arithmetic.pending.";
export const sessionLockName = (id: string) => "arithmetic.session." + id;

export interface SessionOwnership {
  release: () => Promise<void>;
}

// A browser-owned lock outlives timer throttling and is released when its page
// goes away. Recovery never decides that a live page is dead from elapsed time.
export function acquireSessionOwnership(
  id: string,
): Promise<SessionOwnership | null> {
  if (!navigator.locks)
    return Promise.reject(
      new Error(
        "This browser does not support safe session ownership. Use a browser with Web Locks, such as Chrome.",
      ),
    );
  return new Promise((resolve, reject) => {
    let unlocked!: () => void;
    const released = new Promise<void>((done) => {
      unlocked = done;
    });
    void navigator.locks
      .request(sessionLockName(id), { ifAvailable: true }, async (lock) => {
        if (!lock) {
          resolve(null);
          return;
        }
        let release!: () => void;
        const held = new Promise<void>((done) => {
          release = done;
        });
        resolve({
          release: () => {
            release();
            return released;
          },
        });
        await held;
      })
      .then(unlocked)
      .catch((error) => {
        unlocked();
        reject(error);
      });
  });
}

export interface StartFocusGuard {
  lost: boolean;
  dispose: () => void;
}

export const hasPracticeFocus = () =>
  document.visibilityState === "visible" && document.hasFocus();

export function watchStartFocus(): StartFocusGuard {
  const guard = { lost: !hasPracticeFocus(), dispose: () => {} };
  const lost = () => {
    guard.lost = true;
  };
  const hidden = () => {
    if (document.visibilityState !== "visible") lost();
  };
  window.addEventListener("blur", lost);
  window.addEventListener("pagehide", lost);
  document.addEventListener("visibilitychange", hidden);
  guard.dispose = () => {
    window.removeEventListener("blur", lost);
    window.removeEventListener("pagehide", lost);
    document.removeEventListener("visibilitychange", hidden);
  };
  return guard;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ":" + canonical(item))
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "undefined";
}

function validateEvents(events: unknown): asserts events is Observation[] {
  const types = new Set([
    "session-started",
    "question-presented",
    "input-changed",
    "answer-accepted",
    "session-ended",
  ]);
  if (!Array.isArray(events))
    throw new Error("The journal has no observation list.");
  for (const [sequence, event] of events.entries()) {
    if (
      !event ||
      event.sequence !== sequence ||
      !types.has(event.type) ||
      !Number.isFinite(event.elapsedMs) ||
      event.elapsedMs < 0 ||
      !event.payload ||
      typeof event.payload !== "object" ||
      Array.isArray(event.payload)
    )
      throw new Error(
        "The observations are invalid or have a gap in their sequence.",
      );
  }
}

// Both copies are immutable prefixes of the same log. A mismatch is reported,
// never overwritten; a longer database prefix must survive a stale journal.
export function reconcileObservations(
  persisted: Observation[],
  journal: Observation[],
): Observation[] {
  validateEvents(persisted);
  validateEvents(journal);
  for (let i = 0; i < Math.min(persisted.length, journal.length); i++)
    if (canonical(persisted[i]) !== canonical(journal[i]))
      throw new Error(
        `Observation ${i} differs between the journal and database. Both copies have been retained.`,
      );
  const result = structuredClone(
    persisted.length >= journal.length ? persisted : journal,
  );
  const terminal = result.findIndex((e) => e.type === "session-ended");
  if (terminal >= 0 && terminal !== result.length - 1)
    throw new Error(
      "Observations exist after the session ended. Both copies have been retained.",
    );
  return result;
}

export function interruptedEnd(events: Observation[]): Observation {
  const question = [...events]
    .reverse()
    .find((e) => e.type === "question-presented")?.payload.question as
    | { id: string }
    | undefined;
  const solved =
    question &&
    events.some(
      (e) =>
        e.type === "answer-accepted" && e.payload.questionId === question.id,
    );
  return {
    sequence: events.length,
    type: "session-ended",
    elapsedMs: events.at(-1)?.elapsedMs || 0,
    payload: {
      reason: "interrupted-reload",
      wallAt: new Date().toISOString(),
      endTimeKnown: false,
      unfinishedQuestionId: question && !solved ? question.id : null,
    },
  };
}

export function terminalOutcome(
  why: string,
  at: number,
  duration: number,
  started: boolean,
) {
  return started && at >= duration
    ? { reason: "timeout", elapsedMs: duration }
    : { reason: why, elapsedMs: at };
}

export async function recoverPending(): Promise<string[]> {
  const errors: string[] = [];
  // A creation may have committed even when its response never reached the
  // browser. Resolve its durable operation key before recovering observations.
  try {
    for (const key of Object.keys(localStorage).filter((key) =>
      key.startsWith(CREATION_PREFIX),
    )) {
      let creationOwner: SessionOwnership | null = null;
      let sessionOwner: SessionOwnership | null = null;
      try {
        creationOwner = await acquireSessionOwnership(
          "creation." + key.slice(CREATION_PREFIX.length),
        );
        if (!creationOwner) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const body = readCreation(raw);
        if (key !== CREATION_PREFIX + body.creationKey)
          throw new Error(
            "Pending start identity differs from its storage key.",
          );
        const session = await request<{ id: string }>(
          "/api/sessions",
          "POST",
          body,
        );
        sessionOwner = await acquireSessionOwnership(session.id);
        if (!sessionOwner) continue;
        const persisted = await request<{ events: Observation[] }>(
          "/api/sessions/" + session.id,
        );
        if (!localStorage.getItem(JOURNAL_PREFIX + session.id)) {
          localStorage.setItem(
            JOURNAL_PREFIX + session.id,
            JSON.stringify({ id: session.id, events: persisted.events }),
          );
        }
        localStorage.removeItem(key);
      } catch (e) {
        errors.push(`Pending start: ${(e as Error).message}`);
      } finally {
        await sessionOwner?.release();
        await creationOwner?.release();
      }
    }
  } catch (e) {
    errors.push(
      "Pending starts could not be inspected. " + (e as Error).message,
    );
  }
  let keys: string[];
  try {
    keys = Object.keys(localStorage).filter((key) =>
      key.startsWith(JOURNAL_PREFIX),
    );
  } catch (e) {
    return [
      "The browser recovery journal is unavailable. " + (e as Error).message,
    ];
  }
  for (const key of keys) {
    let ownership: SessionOwnership | null = null;
    const id = key.slice(JOURNAL_PREFIX.length);
    try {
      ownership = await acquireSessionOwnership(id);
      if (!ownership) continue;
      // Read only after taking the lock: a prior owner may have just saved and
      // removed the journal while this recovery was being scheduled.
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const saved = JSON.parse(raw);
      if (saved.id !== id)
        throw new Error("Journal identity does not match its storage key.");
      for (let attempt = 0; ; attempt++) {
        const persisted = await request<{ events: Observation[] }>(
          "/api/sessions/" + id,
        );
        const events = reconcileObservations(persisted.events, saved.events);
        try {
          // A synthetic end is only a proposal until SQLite accepts it. Retain
          // the observed prefix, so a late beacon/409 can be reconciled again.
          localStorage.setItem(key, JSON.stringify({ id, events }));
        } catch (e) {
          errors.push(
            `Session ${id}: recovery journal could not be updated. ` +
              (e as Error).message,
          );
        }
        const candidate = events.some((e) => e.type === "session-ended")
          ? events
          : [...events, interruptedEnd(events)];
        try {
          await request("/api/sessions/" + id + "/observations", "POST", {
            events: candidate,
          });
          break;
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 409 || attempt >= 2)
            throw e;
          // Re-read after a concurrent, previously enqueued unload write. The
          // next immutable-prefix comparison still rejects genuine conflicts.
        }
      }
      localStorage.removeItem(key);
    } catch (e) {
      errors.push(`Session ${id}: ` + (e as Error).message);
    } finally {
      ownership?.release();
    }
  }
  return errors;
}
