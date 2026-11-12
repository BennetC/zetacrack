import assert from "node:assert/strict";
import test from "node:test";
import paper from "../../tests/fixtures/optiver-paper.json";
import {
  OptiverGenerator,
  calculate,
  parseRational,
  rationalText,
  optiverConfig,
} from "../src/optiver";
import { validateConfig } from "../src/domain";
import { parseReloadRestart } from "../src/reloadRestart";
import { readCreation } from "../src/sessionCreation";
import { interruptedEnd, reconcileObservations } from "../src/sessionRecovery";

test("Optiver reproduces its cross-stack paper and fixed settings", () => {
  assert.deepEqual(optiverConfig(), paper.config);
  assert.deepEqual(validateConfig(optiverConfig()), {});
  const g = new OptiverGenerator("cross-stack-optiver");
  assert.deepEqual(
    Array.from({ length: 80 }, () => g.next()),
    paper.questions,
  );
  assert.throws(() => g.next(), /80 questions/);
  assert.notDeepEqual(
    new OptiverGenerator("another-paper").next(),
    paper.questions[0],
  );
});

test("300 fresh Optiver papers have exact equations, unique choices, family mix and one correct option", () => {
  let mixed = 0;
  for (let seed = 0; seed < 300; seed++) {
    const g = new OptiverGenerator(String(seed)),
      counts: Record<string, number> = {};
    for (let i = 0; i < 80; i++) {
      const q = g.next(),
        d = q.optiver!;
      counts[d.kind] = (counts[d.kind] || 0) + 1;
      const a = parseRational(q.left),
        b = parseRational(q.right),
        c = parseRational(d.result);
      assert.deepEqual(calculate(q.operation, a, b), c);
      assert.deepEqual(
        parseRational(q.expected),
        d.blank === "left" ? a : d.blank === "right" ? b : c,
      );
      const choices = d.options.map((v) => rationalText(parseRational(v)));
      assert.equal(new Set(choices).size, 4);
      assert.equal(
        choices.filter((v) => v === rationalText(parseRational(q.expected)))
          .length,
        1,
      );
      assert(d.options.includes(q.expected));
      assert.equal(d.profileIndex, i);
      assert.equal(q.selection.operationBasisPoints, null);
      mixed += [q.left, q.right, d.result, ...d.options].filter((s) =>
        s.includes(" "),
      ).length;
    }
    assert.deepEqual(counts, { integer: 29, decimal: 27, fraction: 24 });
  }
  assert(mixed > 0);
});

test("rational and mixed-number parsing preserves exact equivalence", () => {
  assert.deepEqual(parseRational("29 3/4"), parseRational("29.75"));
  assert.deepEqual(parseRational("-2 1/3"), parseRational("-7/3"));
  assert.deepEqual(parseRational("2/18"), parseRational("1/9"));
  assert.equal(
    rationalText(
      calculate(
        "multiplication",
        parseRational("0.19"),
        parseRational("0.003"),
      ),
      true,
    ),
    "0.00057",
  );
  assert.throws(() => parseRational("1/0"));
});

test("Optiver pending creation and reload retain independent mode/provenance", () => {
  const config = optiverConfig();
  const intent = { version: 1, sessionId: "test", mode: "optiver", config };
  assert.deepEqual(parseReloadRestart(JSON.stringify(intent)), intent);
  assert.equal(
    parseReloadRestart(
      JSON.stringify({
        ...intent,
        config: {
          ...config,
          session: { ...config.session, durationSeconds: "120" },
        },
      }),
    ),
    null,
  );
  const creation = {
    creationKey: "optiver-key",
    seed: "seed",
    config,
    mode: "optiver",
    generatorVersion: "optiver-rational-v1",
    policyVersion: "optiver-profile-v1",
    measurementVersion: "choice-response-v1",
    contentVersion: "optiver-80-in-8-v1",
  };
  assert.deepEqual(readCreation(JSON.stringify(creation)), creation);
});

test("choice journals reconcile without marking a submitted question unfinished", () => {
  const observations = [
    { sequence: 0, type: "session-started", elapsedMs: 0, payload: {} },
    {
      sequence: 1,
      type: "question-presented",
      elapsedMs: 0,
      payload: { question: paper.questions[0] },
    },
    {
      sequence: 2,
      type: "answer-submitted",
      elapsedMs: 100,
      payload: { questionId: "q-0", optionIndex: 1, value: "747" },
    },
  ];
  assert.deepEqual(
    reconcileObservations(observations.slice(0, 2), observations),
    observations,
  );
  assert.equal(interruptedEnd(observations).payload.unfinishedQuestionId, null);
});
