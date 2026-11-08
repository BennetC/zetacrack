import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answerMatches,
  basisPoints,
  builtins,
  decimalText,
  effectiveShare,
  QuestionGenerator,
  splitEqually,
  subtractionDomain,
  validateConfig,
  parseDecimal,
  type Config,
  type NumberRange,
} from "../src/domain";
const range = (min: string, max: string, decimalPlaces = 0): NumberRange => ({
  min,
  max,
  decimalPlaces,
});
const config = () => structuredClone(builtins()[0].config);
test("explicit decimal whitespace matches backend config and accepted-input rules", () => {
  const permitted =
    "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
  for (const space of permitted) {
    assert(answerMatches(space + "+21.000" + space, "21"));
    assert.equal(basisPoints(space + "100" + space), 10000);
    assert.equal(decimalText(parseDecimal(space + "-1.2500" + space)), "-1.25");
  }
  for (const unsupported of [
    "\u0085",
    "\u001c",
    "\u001d",
    "\u001e",
    "\u001f",
    "\u180e",
    "\u200b",
    "\u2060",
    "\u0661",
    "\uff11",
  ]) {
    assert(!answerMatches(unsupported + "21" + unsupported, "21"));
    assert.throws(() => basisPoints(unsupported + "100" + unsupported));
  }
});
test("percentage arithmetic is exact and equal splitting preserves 100%", () => {
  assert.equal(basisPoints("33.33"), 3333);
  assert.throws(() => basisPoints("33.333"));
  assert.equal(effectiveShare("60", "50"), "30");
  assert.equal(effectiveShare("33.33", "33.33"), "11.108889");
  assert.deepEqual(splitEqually(3), ["33.34", "33.33", "33.33"]);
});
test("fixed decimal addition has no floating point artifacts", () => {
  const c = config();
  c.operations[0].groups[0].first = range("0.1", "0.1", 1);
  c.operations[0].groups[0].second = range("0.20", "0.20", 2);
  const q = new QuestionGenerator(c, "decimal").next();
  assert.equal(q.expected, "0.3");
  assert.equal(q.left, "0.1");
  assert.equal(q.right, "0.20");
  assert(answerMatches(".3000", q.expected));
  assert(!answerMatches("0.30000000000000004", q.expected));
});
test("negative operands, large exact products, and operand order are preserved", () => {
  const c = structuredClone(builtins()[2].config);
  c.operations[0].groups[0].first = range(
    "-9007199254740993",
    "-9007199254740993",
  );
  const q = new QuestionGenerator(c, "large").next();
  assert.equal(q.left, "-9007199254740993");
  assert.equal(q.right, "11");
  assert.equal(q.expected, "-99079191802150923");
});
test("all valid subtraction pairs have exactly one rank, including mixed precision", () => {
  for (const [left, right] of [
    [range("-3", "3"), range("-2", "4")],
    [range("-0.3", "0.3", 1), range("-0.20", "0.40", 2)],
    [range("0", "2"), range("0.0", "2.0", 1)],
  ]) {
    const domain = subtractionDomain(left, right),
      pairs = new Set<string>();
    for (let i = 0n; i < domain.count; i++) {
      const [a, b] = domain.unrank(i);
      const key = decimalText(a, true) + "|" + decimalText(b, true);
      assert(!pairs.has(key));
      pairs.add(key);
      assert(Number(decimalText(a)) >= Number(decimalText(b)));
    }
    const expected = new Set<string>();
    const na = Math.round(
        (Number(left.max) - Number(left.min)) * 10 ** left.decimalPlaces,
      ),
      nb = Math.round(
        (Number(right.max) - Number(right.min)) * 10 ** right.decimalPlaces,
      );
    for (let a = 0; a <= na; a++)
      for (let b = 0; b <= nb; b++) {
        const aa = Number(left.min) + a / 10 ** left.decimalPlaces,
          bb = Number(right.min) + b / 10 ** right.decimalPlaces;
        if (aa >= bb - 1e-12)
          expected.add(
            aa.toFixed(left.decimalPlaces) +
              "|" +
              bb.toFixed(right.decimalPlaces),
          );
      }
    assert.deepEqual(pairs, expected);
  }
});
test("a sparse huge subtraction grid samples its single valid pair without rejection", () => {
  const c = structuredClone(builtins()[1].config),
    g = c.operations[0].groups[0];
  g.first = range("-1000000000000000000000000", "0");
  g.second = range("0", "1000000000000000000000000");
  const engine = new QuestionGenerator(c, "sparse");
  for (let i = 0; i < 20; i++) {
    const q = engine.next();
    assert.equal(q.left, "0");
    assert.equal(q.right, "0");
    assert.equal(q.selection.validPairCount, "1");
  }
});
test("division excludes zero and samples exact finite answers at their selected precision", () => {
  const c = config();
  c.operations[0].id = "division";
  const g = c.operations[0].groups[0];
  g.first = range("-1", "1");
  g.second = range("-0.125", "0.125", 3);
  const engine = new QuestionGenerator(c, "division");
  for (let i = 0; i < 300; i++) {
    const q = engine.next();
    assert.notEqual(q.right, "0");
    assert.equal(q.selection.validPairCount, "502");
    assert(Math.abs(Number(q.expected)) <= 0.125);
    assert(
      Math.abs(Number(q.left) / Number(q.right) - Number(q.expected)) < 1e-12,
    );
  }
});
test("invalid ranges, precision, empty selections, and impossible configurations are rejected", () => {
  let c = config();
  c.operations = [];
  assert(validateConfig(c).operations);
  c = config();
  c.operations[0].groups[0].first = range("2", "1");
  assert(Object.keys(validateConfig(c)).some((k) => k.endsWith(".first")));
  c = config();
  c.operations[0].groups[0].first = range("0.001", "1", 2);
  assert(Object.keys(validateConfig(c)).some((k) => k.endsWith(".first")));
  c = config();
  c.operations[0].id = "division";
  c.operations[0].groups[0].first = range("0", "0");
  assert(Object.keys(validateConfig(c)).some((k) => k.endsWith(".first")));
  c = structuredClone(builtins()[1].config);
  c.operations[0].groups[0].first = range("1", "1");
  c.operations[0].groups[0].second = range("2", "2");
  assert(Object.keys(validateConfig(c)).some((k) => k.endsWith(".second")));
  c.operations[0].groups[0].allowNegative = true;
  assert.deepEqual(validateConfig(c), {});
  assert.equal(new QuestionGenerator(c, "signed").next().expected, "-1");
});
test("seed, full configuration, and generator version reproduce ordered questions", () => {
  const c = config(),
    g = c.operations[0].groups[0];
  g.share = "50";
  c.operations[0].groups.push({
    ...structuredClone(g),
    id: "second",
    share: "50",
  });
  const first = new QuestionGenerator(c, "replay"),
    second = new QuestionGenerator(c, "replay");
  for (let i = 0; i < 100; i++) assert.deepEqual(first.next(), second.next());
  const a = new QuestionGenerator(c, "A"),
    b = new QuestionGenerator(c, "B");
  assert.notDeepEqual(
    Array.from({ length: 8 }, () => a.next()),
    Array.from({ length: 8 }, () => b.next()),
  );
});
test("operation and group shares exclude zero weights and identify overlapping groups", () => {
  const c = config();
  c.operations.push({
    ...structuredClone(c.operations[0]),
    id: "multiplication",
    share: "0",
    groups: [{ ...structuredClone(c.operations[0].groups[0]), id: "zero" }],
  });
  const g = c.operations[0].groups[0];
  g.share = "25";
  c.operations[0].groups.push({
    ...structuredClone(g),
    id: "overlap",
    share: "75",
  });
  const engine = new QuestionGenerator(c, "weights"),
    counts = new Map<string, number>();
  for (let i = 0; i < 2000; i++) {
    const q = engine.next();
    assert.equal(q.operation, "addition");
    counts.set(q.groupId, (counts.get(q.groupId) || 0) + 1);
  }
  assert(Math.abs((counts.get(g.id) || 0) / 2000 - 0.25) < 0.035);
});
test("partial inputs are not answers; equivalent signs and decimals are accepted exactly", () => {
  for (const raw of ["", "-", ".", "-.", "1e2", "NaN", "1,2"])
    assert(!answerMatches(raw, "0"));
  assert(answerMatches("-0.000", "0"));
  assert(answerMatches("+001.20", "1.2"));
  assert(!answerMatches("1.2", "12"));
});
test("timed durations require positive whole seconds and endless ignores its retained duration", () => {
  const c = config();
  for (const duration of ["0", "1.5", "-1", ""]) {
    c.session.durationSeconds = duration;
    assert(validateConfig(c).duration);
  }
  c.session.format = "endless";
  assert(!validateConfig(c).duration);
});
