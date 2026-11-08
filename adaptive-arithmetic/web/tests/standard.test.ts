import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  builtins,
  FixedStandardPolicy,
  QuestionGenerator,
  SeededRandom,
  WeightedRandomPolicy,
} from "../src/domain";
import {
  StandardGenerator,
  standardConfig,
  standardQuestion,
} from "../src/standard";

test("standard reverse-addition and reverse-product rules preserve inclusive extremes", () => {
  assert.deepEqual(standardQuestion("subtraction", 100n, 100n), {
    left: "200",
    right: "100",
    expected: "100",
  });
  assert.deepEqual(standardQuestion("subtraction", 2n, 2n), {
    left: "4",
    right: "2",
    expected: "2",
  });
  assert.deepEqual(standardQuestion("division", 12n, 100n), {
    left: "1200",
    right: "12",
    expected: "100",
  });
  assert.deepEqual(standardQuestion("multiplication", 2n, 2n), {
    left: "2",
    right: "2",
    expected: "4",
  });
  assert.deepEqual(standardQuestion("addition", 100n, 100n), {
    left: "100",
    right: "100",
    expected: "200",
  });
  assert.deepEqual(standardConfig().session, {
    format: "timed",
    durationSeconds: "120",
    countdown: false,
  });
});
test("standard seed replay, independent draws, repeats and equal selection", () => {
  const a = new StandardGenerator("standard-repeat"),
    b = new StandardGenerator("standard-repeat");
  const counts = {
    addition: 0,
    subtraction: 0,
    multiplication: 0,
    division: 0,
  };
  const extrema = new Set<string>(),
    seen = new Set<string>();
  let repeats = 0;
  for (let i = 0; i < 20000; i++) {
    const q = a.next();
    assert.deepEqual(q, b.next());
    counts[q.operation]++;
    const first = BigInt(
      ["subtraction", "division"].includes(q.operation) ? q.right : q.left,
    );
    const second = BigInt(
      ["subtraction", "division"].includes(q.operation) ? q.expected : q.right,
    );
    const max = ["addition", "subtraction"].includes(q.operation) ? 100n : 12n;
    assert(first >= 2n && first <= max);
    assert(second >= 2n && second <= 100n);
    assert.deepEqual(standardQuestion(q.operation, first, second), {
      left: q.left,
      right: q.right,
      expected: q.expected,
    });
    extrema.add(q.operation + ":" + first);
    extrema.add(q.operation + ":b:" + second);
    const key = `${q.operation}:${q.left}:${q.right}`;
    if (seen.has(key)) repeats++;
    seen.add(key);
    assert.equal(q.selection.operationBasisPoints, 2500);
  }
  for (const [op, n] of Object.entries(counts)) {
    assert(n > 4500 && n < 5500);
    assert(extrema.has(op + ":2"));
    assert(extrema.has(op + ":b:100"));
  }
  assert(repeats > 0);
});
test("legacy custom seeded sequence and random consumption remain unchanged", () => {
  const generator = new QuestionGenerator(
    builtins()[1].config,
    "legacy-replay",
  );
  const digest = createHash("sha256")
    .update(JSON.stringify(Array.from({ length: 500 }, () => generator.next())))
    .digest("hex");
  // Captured from the committed pre-completion exact-grid-v1 source.
  assert.equal(
    digest,
    "814b2c5e2cccdce6ae65fda2e06d63d1a212dd1ea57da453ed555b087eec47cd",
  );
});
test("fixed and weighted policies implement the replaceable selection boundary", () => {
  const custom = builtins()[0].config;
  assert.equal(
    new WeightedRandomPolicy().choose(custom, new SeededRandom("policy"))
      .operation.id,
    "addition",
  );
  const selected = new FixedStandardPolicy().choose(
    standardConfig(),
    new SeededRandom("policy"),
  );
  assert.equal(selected.group.id, "standard-" + selected.operation.id);
  let calls = 0;
  const generator = new QuestionGenerator(custom, "replacement", {
    version: "test-only-fixed",
    choose: (config) => {
      calls++;
      return {
        operation: config.operations[0],
        group: config.operations[0].groups[0],
      };
    },
  });
  assert.equal(generator.next().operation, "addition");
  assert.equal(calls, 1);
});
