export const OPERATIONS = [
  "addition",
  "subtraction",
  "multiplication",
  "division",
] as const;
export type Operation = (typeof OPERATIONS)[number];
export const TITLES: Record<Operation, string> = {
  addition: "Addition",
  subtraction: "Subtraction",
  multiplication: "Multiplication",
  division: "Division",
};
export interface NumberRange {
  min: string;
  max: string;
  decimalPlaces: number;
}
export interface Group {
  id: string;
  version: 1;
  name: string;
  share: string;
  first: NumberRange;
  second: NumberRange;
  allowNegative: boolean;
}
export interface OperationConfig {
  id: Operation;
  version: 1;
  share: string;
  groups: Group[];
}
export interface Config {
  version: 1;
  operations: OperationConfig[];
  session: {
    format: "timed" | "endless";
    durationSeconds: string;
    countdown: boolean;
  };
}
export interface Preset {
  id: string;
  name: string;
  config: Config;
}
export interface Decimal {
  coefficient: bigint;
  scale: number;
}
export type Errors = Record<string, string>;
export function configsEqual(first: Config, second: Config): boolean {
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, child]) => [key, canonical(child)]),
      );
    }
    return value;
  }
  return JSON.stringify(canonical(first)) === JSON.stringify(canonical(second));
}
export const GENERATOR_VERSION = "exact-grid-v1";
export const POLICY_VERSION = "hierarchical-shares-v1";
const pow10 = (n: number) => 10n ** BigInt(n);

// Exact ECMAScript WhiteSpace + LineTerminator set, shared with
// server/decimal_input.py. Preserve the original string in observations/config.
export function trimDecimalWhitespace(text: string): string {
  return text.replace(
    /^[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$/g,
    "",
  );
}

export function parseDecimal(text: string): Decimal {
  const value = trimDecimalWhitespace(text);
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))
    throw new Error("Enter a decimal number without separators or exponents.");
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^[+-]/, "").split(".");
  return {
    coefficient: BigInt((whole || "0") + fraction) * (negative ? -1n : 1n),
    scale: fraction.length,
  };
}
export function decimalText(value: Decimal, fixed = false): string {
  const negative = value.coefficient < 0n;
  let digits = (negative ? -value.coefficient : value.coefficient)
    .toString()
    .padStart(value.scale + 1, "0");
  if (value.scale)
    digits = digits.slice(0, -value.scale) + "." + digits.slice(-value.scale);
  if (!fixed && value.scale)
    digits = digits.replace(/0+$/, "").replace(/\.$/, "");
  return (negative ? "-" : "") + digits;
}
export function scaled(value: Decimal, scale: number): bigint {
  if (value.scale <= scale)
    return value.coefficient * pow10(scale - value.scale);
  const divisor = pow10(value.scale - scale);
  if (value.coefficient % divisor)
    throw new Error("Bounds must fit the selected decimal places.");
  return value.coefficient / divisor;
}
export function basisPoints(text: string): number {
  const bp = scaled(parseDecimal(text), 2);
  if (bp < 0n || bp > 10000n)
    throw new Error(
      "Use a percentage from 0 to 100, with at most two decimal places.",
    );
  return Number(bp);
}
export function splitEqually(count: number): string[] {
  if (!count) return [];
  const base = Math.floor(10000 / count),
    remainder = 10000 % count;
  return Array.from({ length: count }, (_, index) =>
    decimalText({
      coefficient: BigInt(base + (index < remainder ? 1 : 0)),
      scale: 2,
    }),
  );
}
export function effectiveShare(operation: string, group: string): string {
  try {
    return decimalText({
      coefficient: BigInt(basisPoints(operation)) * BigInt(basisPoints(group)),
      scale: 6,
    });
  } catch {
    return "—";
  }
}
export function newGroup(operation: Operation, first = false): Group {
  return {
    id: crypto.randomUUID(),
    version: 1,
    name: TITLES[operation] + " group",
    share: first ? "100" : "0",
    first: {
      min: operation === "division" ? "2" : "10",
      max: operation === "division" ? "12" : "99",
      decimalPlaces: 0,
    },
    second: {
      min: operation === "division" ? "2" : "10",
      max: operation === "division" ? "100" : "99",
      decimalPlaces: 0,
    },
    allowNegative: false,
  };
}
export function builtins(): Preset[] {
  return (
    [
      "addition",
      "subtraction",
      "multiplication",
      "multiplication",
    ] as Operation[]
  ).map((operation, index) => {
    const group = newGroup(operation, true);
    group.id = `builtin-group-${index}`;
    const name =
      index === 0
        ? "Two-digit addition"
        : index === 1
          ? "Two-digit subtraction"
          : `Multiply by ${index === 2 ? 11 : 12}`;
    group.name = name;
    if (index > 1)
      group.second.min = group.second.max = index === 2 ? "11" : "12";
    return {
      id: `builtin-${index}`,
      name,
      config: {
        version: 1,
        operations: [
          { id: operation, version: 1, share: "100", groups: [group] },
        ],
        session: { format: "timed", durationSeconds: "120", countdown: false },
      },
    };
  });
}
export function grid(range: NumberRange) {
  if (
    !Number.isInteger(range.decimalPlaces) ||
    range.decimalPlaces < 0 ||
    range.decimalPlaces > 3
  )
    throw new Error("Choose 0–3 decimal places.");
  const min = scaled(parseDecimal(range.min), range.decimalPlaces),
    max = scaled(parseDecimal(range.max), range.decimalPlaces);
  if (min > max)
    throw new Error("Minimum must be less than or equal to maximum.");
  return { min, max, count: max - min + 1n, scale: range.decimalPlaces };
}
const ceilDiv = (a: bigint, b: bigint) => (a >= 0n ? (a + b - 1n) / b : a / b);
const clamp = (n: bigint, limit: bigint) =>
  n < 0n ? 0n : n > limit ? limit : n;
function floorSum(n: bigint, m: bigint, a: bigint, b: bigint): bigint {
  let answer = 0n;
  while (true) {
    if (a >= m) {
      answer += ((n - 1n) * n * (a / m)) / 2n;
      a %= m;
    }
    if (b >= m) {
      answer += n * (b / m);
      b %= m;
    }
    const y = a * n + b;
    if (y < m) return answer;
    n = y / m;
    b = y % m;
    [m, a] = [a, m];
  }
}
// Prefix counts permit direct uniform sampling even when only one pair in a huge grid is valid.
export function subtractionDomain(first: NumberRange, second: NumberRange) {
  const left = grid(first),
    right = grid(second),
    scale = Math.max(left.scale, right.scale);
  const a = left.min * pow10(scale - left.scale),
    b = right.min * pow10(scale - right.scale);
  const stepA = pow10(scale - left.scale),
    stepB = pow10(scale - right.scale);
  function prefix(n: bigint): bigint {
    const start = clamp(ceilDiv(b - a, stepA), n);
    const full = clamp(ceilDiv(b + (right.count - 1n) * stepB - a, stepA), n);
    const middle = full - start;
    return (
      (middle
        ? floorSum(middle, stepB, stepA, a - b + start * stepA) + middle
        : 0n) +
      (n - full) * right.count
    );
  }
  const count = prefix(left.count);
  function unrank(rank: bigint): [Decimal, Decimal] {
    if (rank < 0n || rank >= count) throw new Error("Pair rank out of range.");
    let lo = 0n,
      hi = left.count - 1n;
    while (lo < hi) {
      const mid = (lo + hi) / 2n;
      if (prefix(mid + 1n) > rank) hi = mid;
      else lo = mid + 1n;
    }
    return [
      { coefficient: left.min + lo, scale: left.scale },
      { coefficient: right.min + rank - prefix(lo), scale: right.scale },
    ];
  }
  return { count, unrank };
}
export function validateConfig(config: Config): Errors {
  const errors: Errors = {},
    ids = new Set<string>();
  if (config.version !== 1)
    errors.version = "Unsupported configuration version.";
  if (!config.operations.length)
    errors.operations = "Add at least one operation.";
  let total = 0;
  for (const operation of config.operations) {
    const path = `operations.${operation.id}`;
    if (
      !OPERATIONS.includes(operation.id) ||
      ids.has(operation.id) ||
      operation.version !== 1
    )
      errors[path] = "Operation identities must be unique and versioned.";
    ids.add(operation.id);
    let operationBP = 0;
    try {
      operationBP = basisPoints(operation.share);
      total += operationBP;
    } catch (error) {
      errors[path + ".share"] = (error as Error).message;
    }
    let groupTotal = 0;
    for (const group of operation.groups) {
      const gpath = `groups.${group.id}`;
      if (ids.has(group.id) || !group.id || group.version !== 1)
        errors[gpath] = "Exercise identities must be unique and versioned.";
      ids.add(group.id);
      if (!group.name.trim())
        errors[gpath + ".name"] = "Give this exercise group a name.";
      let groupBP = 0;
      try {
        groupBP = basisPoints(group.share);
        groupTotal += groupBP;
      } catch (error) {
        errors[gpath + ".share"] = (error as Error).message;
      }
      let first: ReturnType<typeof grid> | undefined,
        second: ReturnType<typeof grid> | undefined;
      try {
        first = grid(group.first);
      } catch (error) {
        errors[gpath + ".first"] = (error as Error).message;
      }
      try {
        second = grid(group.second);
      } catch (error) {
        errors[gpath + ".second"] = (error as Error).message;
      }
      if (operationBP && groupBP && first && second) {
        if (operation.id === "division" && first.min === 0n && first.max === 0n)
          errors[gpath + ".first"] =
            "A divisor range must contain a nonzero value.";
        if (
          operation.id === "subtraction" &&
          !group.allowNegative &&
          subtractionDomain(group.first, group.second).count === 0n
        )
          errors[gpath + ".second"] =
            "No nonnegative answers exist in these ranges. Change the ranges or allow negatives.";
      }
    }
    if (operationBP && groupTotal !== 10000)
      errors[path + ".groups"] =
        "Group shares must total exactly 100% for this active operation.";
  }
  if (total !== 10000)
    errors.operations = "Operation shares must total exactly 100%.";
  if (!["timed", "endless"].includes(config.session.format))
    errors.format = "Choose timed or endless practice.";
  if (
    config.session.format === "timed" &&
    (!/^\d+$/.test(config.session.durationSeconds) ||
      !Number.isSafeInteger(Number(config.session.durationSeconds)) ||
      Number(config.session.durationSeconds) < 1)
  )
    errors.duration = "Enter a positive whole number of seconds.";
  return errors;
}
export class SeededRandom {
  private state: bigint = 0xcbf29ce484222325n;
  private readonly mask = (1n << 64n) - 1n;
  constructor(seed: string) {
    for (const byte of new TextEncoder().encode(seed))
      this.state = ((this.state ^ BigInt(byte)) * 0x100000001b3n) & this.mask;
  }
  next64(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & this.mask;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & this.mask;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & this.mask;
    return (z ^ (z >> 31n)) & this.mask;
  }
  below(bound: bigint): bigint {
    if (bound <= 0n) throw new Error("Empty sampling domain.");
    if (bound === 1n) return 0n;
    const bits = (bound - 1n).toString(2).length,
      blocks = Math.ceil(bits / 64);
    while (true) {
      let value = 0n;
      for (let i = 0; i < blocks; i++) value = (value << 64n) | this.next64();
      value >>= BigInt(blocks * 64 - bits);
      if (value < bound) return value;
    }
  }
}
function weighted<T extends { share: string }>(
  items: T[],
  random: SeededRandom,
): T {
  let ticket = Number(random.below(10000n));
  for (const item of items) {
    ticket -= basisPoints(item.share);
    if (ticket < 0) return item;
  }
  throw new Error("Shares must sum to 100%.");
}
export interface SelectionPolicy {
  readonly version: string;
  choose(
    config: Config,
    random: SeededRandom,
  ): { operation: OperationConfig; group: Group };
}
export class WeightedRandomPolicy implements SelectionPolicy {
  readonly version = POLICY_VERSION;
  choose(config: Config, random: SeededRandom) {
    // Keep the original operation-then-group draws, including PRNG consumption.
    const operation = weighted(config.operations, random);
    return { operation, group: weighted(operation.groups, random) };
  }
}
export class FixedStandardPolicy implements SelectionPolicy {
  readonly version = "equal-operations-v1";
  choose(config: Config, random: SeededRandom) {
    const operation = config.operations[Number(random.below(4n))];
    return { operation, group: operation.groups[0] };
  }
}
function sample(
  range: NumberRange,
  random: SeededRandom,
  nonzero = false,
): Decimal {
  const values = grid(range),
    hasZero = values.min <= 0n && values.max >= 0n;
  let index = random.below(values.count - (nonzero && hasZero ? 1n : 0n));
  if (nonzero && hasZero && index >= -values.min) index++;
  return { coefficient: values.min + index, scale: values.scale };
}
export interface Question {
  id: string;
  index: number;
  operation: Operation;
  groupId: string;
  left: string;
  right: string;
  expected: string;
  selection: {
    operationBasisPoints: number;
    groupBasisPoints: number;
    validPairCount: string;
  };
}
export class QuestionGenerator {
  private random: SeededRandom;
  private index = 0;
  private domains = new Map<string, ReturnType<typeof subtractionDomain>>();
  constructor(
    private config: Config,
    seed: string,
    private policy: SelectionPolicy = new WeightedRandomPolicy(),
  ) {
    if (Object.keys(validateConfig(config)).length)
      throw new Error("Cannot generate from an invalid configuration.");
    this.config = structuredClone(config);
    this.random = new SeededRandom(seed);
    for (const op of config.operations)
      if (op.id === "subtraction")
        for (const g of op.groups)
          if (!g.allowNegative)
            this.domains.set(g.id, subtractionDomain(g.first, g.second));
  }
  next(): Question {
    const { operation, group } = this.policy.choose(this.config, this.random);
    let first: Decimal, second: Decimal;
    let count = grid(group.first).count * grid(group.second).count;
    if (operation.id === "subtraction" && !group.allowNegative) {
      const domain = this.domains.get(group.id)!;
      count = domain.count;
      [first, second] = domain.unrank(this.random.below(count));
    } else {
      first = sample(group.first, this.random, operation.id === "division");
      second = sample(group.second, this.random);
      if (operation.id === "division") {
        const divisor = grid(group.first);
        if (divisor.min <= 0n && divisor.max >= 0n)
          count -= grid(group.second).count;
      }
    }
    const scale = Math.max(first.scale, second.scale);
    const product: Decimal = {
      coefficient: first.coefficient * second.coefficient,
      scale: first.scale + second.scale,
    };
    let left = decimalText(first, true),
      right = decimalText(second, true),
      answer: Decimal;
    if (operation.id === "division") {
      left = decimalText(product);
      right = decimalText(first, true);
      answer = second;
    } else if (operation.id === "multiplication") answer = product;
    else
      answer = {
        coefficient:
          scaled(first, scale) +
          (operation.id === "addition" ? 1n : -1n) * scaled(second, scale),
        scale,
      };
    const index = this.index++;
    return {
      id: `q-${index}`,
      index,
      operation: operation.id,
      groupId: group.id,
      left,
      right,
      expected: decimalText(answer),
      selection: {
        operationBasisPoints: basisPoints(operation.share),
        groupBasisPoints: basisPoints(group.share),
        validPairCount: count.toString(),
      },
    };
  }
}
export function answerMatches(raw: string, expected: string): boolean {
  try {
    const a = parseDecimal(raw),
      b = parseDecimal(expected),
      scale = Math.max(a.scale, b.scale);
    return scaled(a, scale) === scaled(b, scale);
  } catch {
    return false;
  }
}
