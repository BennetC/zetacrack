import assert from "node:assert/strict";
import { test } from "node:test";
import {
  interruptedEnd,
  reconcileObservations,
  terminalOutcome,
  type Observation,
} from "../src/sessionRecovery";

const started: Observation = {
  sequence: 0,
  type: "session-started",
  elapsedMs: 0,
  payload: { wallAt: "synthetic" },
};
const shown: Observation = {
  sequence: 1,
  type: "question-presented",
  elapsedMs: 2,
  payload: { question: { id: "synthetic-question", left: "1", right: "2" } },
};
const input: Observation = {
  sequence: 2,
  type: "input-changed",
  elapsedMs: 123,
  payload: {
    questionId: "synthetic-question",
    value: "9",
    inputType: "insertText",
  },
};

test("stale journal preserves newer database input and assigns the next recovery sequence", () => {
  const merged = reconcileObservations(
    [started, shown, input],
    [started, shown],
  );
  assert.deepEqual(merged, [started, shown, input]);
  const terminal = interruptedEnd(merged);
  assert.equal(terminal.sequence, 3);
  assert.equal(terminal.elapsedMs, 123);
  assert.equal(terminal.payload.unfinishedQuestionId, "synthetic-question");
  assert.equal(terminal.payload.endTimeKnown, false);
});

test("unacknowledged journal tail survives, but immutable overlap and sequence gaps are rejected", () => {
  assert.deepEqual(reconcileObservations([started], [started, shown, input]), [
    started,
    shown,
    input,
  ]);
  assert.throws(
    () =>
      reconcileObservations(
        [started, shown, input],
        [
          started,
          shown,
          { ...input, payload: { ...input.payload, value: "8" } },
        ],
      ),
    /Observation 2 differs/,
  );
  assert.throws(
    () => reconcileObservations([started, input], [started]),
    /gap/,
  );
  assert.throws(
    () => reconcileObservations([], [{ ...started, elapsedMs: NaN }]),
    /invalid/,
  );
});

test("matching JSON fields need not have matching property order; persisted termination is retained", () => {
  const terminal = interruptedEnd([started, shown, input]);
  const stored = [started, shown, input, terminal];
  const reordered = {
    payload: started.payload,
    elapsedMs: started.elapsedMs,
    type: started.type,
    sequence: started.sequence,
  };
  assert.deepEqual(reconcileObservations(stored, [reordered, shown]), stored);
  assert.throws(
    () => reconcileObservations([...stored, { ...input, sequence: 4 }], []),
    /after the session ended/,
  );
});

test("recovery does not mark a solved or never-presented question unfinished", () => {
  assert.equal(interruptedEnd([]).payload.unfinishedQuestionId, null);
  const accepted: Observation = {
    sequence: 2,
    type: "answer-accepted",
    elapsedMs: 123,
    payload: { questionId: "synthetic-question" },
  };
  assert.equal(
    interruptedEnd([started, shown, accepted]).payload.unfinishedQuestionId,
    null,
  );
});

test("every active terminal action at the deadline becomes timeout; earlier, countdown and endless endings retain their meaning", () => {
  for (const why of ["focus-loss", "manual-end", "page-exit", "timeout"]) {
    assert.deepEqual(terminalOutcome(why, 1000, 1000, true), {
      reason: "timeout",
      elapsedMs: 1000,
    });
    assert.deepEqual(terminalOutcome(why, 1500, 1000, true), {
      reason: "timeout",
      elapsedMs: 1000,
    });
  }
  assert.deepEqual(terminalOutcome("focus-loss", 999, 1000, true), {
    reason: "focus-loss",
    elapsedMs: 999,
  });
  assert.deepEqual(terminalOutcome("manual-end", 0, 1000, false), {
    reason: "manual-end",
    elapsedMs: 0,
  });
  assert.deepEqual(terminalOutcome("page-exit", 1500, Infinity, true), {
    reason: "page-exit",
    elapsedMs: 1500,
  });
});
