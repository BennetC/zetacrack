import assert from "node:assert/strict";
import { test } from "node:test";
import { practiceSelection, type RunQuestion } from "../src/explorer";
import {
  replayFrameAt,
  boundedTarget,
  paceSteps,
  typicalPaceSteps,
  scoreAt,
} from "../src/explorer";
import { QuestionGenerator, validateConfig } from "../src/domain";

test("selected signed decimal questions reproduce exactly, including reverse division", () => {
  const questions = [
    { operation: "addition", left: "-1.25", right: "0.5", expected: "-0.75" },
    { operation: "subtraction", left: "2", right: "9", expected: "-7" },
    {
      operation: "multiplication",
      left: "1.25",
      right: "0.25",
      expected: "0.3125",
    },
    { operation: "division", left: "0.3125", right: "1.25", expected: "0.25" },
  ].map((q) => ({ ...q, totalMs: 100, unfinishedMs: null })) as RunQuestion[];
  const config = practiceSelection(questions);
  assert.deepEqual(validateConfig(config), {});
  const generator = new QuestionGenerator(config, "selected-questions");
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const q = generator.next();
    const source = questions.find((s) => s.operation === q.operation)!;
    assert.equal(Number(q.left), Number(source.left));
    assert.equal(Number(q.right), Number(source.right));
    assert.equal(Number(q.expected), Number(source.expected));
    seen.add(q.operation);
  }
  assert.equal(seen.size, 4);
  assert.throws(() => practiceSelection([]));
  assert.throws(() => practiceSelection([{ ...questions[0], totalMs: null }]));
});

test("replay stepping can anchor to the scrubbed frame and target pace stays finite", () => {
  const q = {
    frames: [{ atMs: 100 }, { atMs: 300 }, { atMs: 500 }],
  } as RunQuestion;
  assert.equal(replayFrameAt(q, 0), -1);
  assert.equal(replayFrameAt(q, 350), 1);
  assert.equal(replayFrameAt(q, 500), 2);
  assert.equal(boundedTarget("1e309"), 0);
  assert.equal(boundedTarget("-10"), 0);
  assert.equal(boundedTarget("100001"), 100000);
  assert.equal(boundedTarget("60"), 60);
});

test("pace retains exact early, simultaneous and end-boundary completions", () => {
  const run = {
    questions: [
      { acceptedMs: 119999.99 },
      { acceptedMs: null },
      { acceptedMs: 0.1 },
      { acceptedMs: 0.1 },
      { acceptedMs: 120000 },
    ],
  };
  assert.deepEqual(paceSteps(run, 120000), [
    [0, 0],
    [0.1, 0],
    [0.1, 1],
    [0.1, 1],
    [0.1, 2],
    [119999.99, 2],
    [119999.99, 3],
    [120000, 3],
    [120000, 4],
    [120000, 4],
  ]);
  assert.equal(scoreAt(run, 0), 0);
  assert.equal(scoreAt(run, 0.1), 2);
  assert.equal(scoreAt(run, 120000), 4);
  assert.deepEqual(paceSteps({ questions: [] }, 0), [
    [0, 0],
    [0, 0],
  ]);
});

test("typical pace is the exact pointwise median, including zero-score peers", () => {
  const runs = [
    { questions: [{ acceptedMs: 100 }, { acceptedMs: 200 }] },
    { questions: [{ acceptedMs: 200 }, { acceptedMs: 300 }] },
  ];
  assert.deepEqual(typicalPaceSteps(runs, 400), [
    [0, 0],
    [100, 0],
    [100, 0.5],
    [200, 0.5],
    [200, 1.5],
    [300, 1.5],
    [300, 2],
    [400, 2],
  ]);
  assert.equal(
    typicalPaceSteps([...runs, { questions: [] }], 400).at(-1)?.[1],
    2,
  );
  assert.equal(
    typicalPaceSteps([...runs, { questions: [] }, { questions: [] }], 400).at(
      -1,
    )?.[1],
    1,
  );
});
