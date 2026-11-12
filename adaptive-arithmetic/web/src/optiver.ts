import profiles from "../../shared/optiver-profile.json";
import {
  OPERATIONS,
  SeededRandom,
  parseDecimal,
  type Config,
  type Operation,
  type Question,
} from "./domain";

export const OPTIVER_CONTENT = "optiver-80-in-8-v1";
export const OPTIVER_GENERATOR = "optiver-rational-v1";
export const OPTIVER_POLICY = "optiver-profile-v1";
export const OPTIVER_MEASUREMENT = "choice-response-v1";
export const OPTIVER_COUNT = 80;
export const OPTIVER_PASS = 56;
export type PlayMode = "standard" | "custom" | "optiver";
export type Rational = { n: bigint; d: bigint };

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  while (b) [a, b] = [b, a % b];
  return a;
}
export function rational(n: bigint, d = 1n): Rational {
  if (!d) throw new Error("Division by zero");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}
export function parseRational(value: string): Rational {
  const mixed = /^(-?)(\d+) (\d+)\/(\d+)$/.exec(value);
  if (mixed)
    return rational(
      (BigInt(mixed[2]) * BigInt(mixed[4]) + BigInt(mixed[3])) *
        (mixed[1] ? -1n : 1n),
      BigInt(mixed[4]),
    );
  const fraction = /^(-?\d+)\/(\d+)$/.exec(value);
  if (fraction) return rational(BigInt(fraction[1]), BigInt(fraction[2]));
  const decimal = parseDecimal(value);
  return rational(decimal.coefficient, 10n ** BigInt(decimal.scale));
}
export function calculate(op: Operation, a: Rational, b: Rational): Rational {
  if (op === "addition") return rational(a.n * b.d + b.n * a.d, a.d * b.d);
  if (op === "subtraction") return rational(a.n * b.d - b.n * a.d, a.d * b.d);
  if (op === "multiplication") return rational(a.n * b.n, a.d * b.d);
  return rational(a.n * b.d, a.d * b.n);
}
export function rationalText(value: Rational, decimal = false): string {
  const { n, d } = value;
  if (d === 1n) return String(n);
  if (decimal) {
    let remainder = n < 0n ? -n : n;
    const whole = remainder / d;
    remainder %= d;
    let tail = "";
    while (remainder && tail.length < 12) {
      remainder *= 10n;
      tail += String(remainder / d);
      remainder %= d;
    }
    if (!remainder) return `${n < 0n ? "-" : ""}${whole}.${tail}`;
  }
  return `${n}/${d}`;
}
export function optiverConfig(): Config {
  // These groups describe the paper. The fixed profile chooses its positions;
  // it does not make weighted random operation/group draws.
  return {
    version: 1,
    operations: OPERATIONS.map((id) => ({
      id,
      version: 1,
      share: "25",
      groups: [
        {
          id: `optiver-${id}`,
          version: 1,
          name: `Optiver ${id}`,
          share: "100",
          first: { min: "0", max: "999", decimalPlaces: 3 },
          second: { min: "0", max: "999", decimalPlaces: 3 },
          allowNegative: false,
        },
      ],
    })),
    session: { format: "timed", durationSeconds: "480", countdown: false },
  };
}

export class OptiverGenerator {
  private random: SeededRandom;
  private index = 0;
  constructor(seed: string) {
    this.random = new SeededRandom(seed);
  }
  private int(low: number, high: number) {
    return BigInt(low) + this.random.below(BigInt(high - low + 1));
  }
  next(): Question {
    if (this.index >= OPTIVER_COUNT)
      throw new Error("This paper has 80 questions.");
    const index = this.index++,
      profile = profiles[index];
    const op = profile.operation as Operation;
    const kind = profile.kind as NonNullable<Question["optiver"]>["kind"];
    let a: Rational, b: Rational;
    if (kind === "integer") {
      a = rational(
        this.int(profile.large ? 300 : 12, profile.large ? 999 : 99),
      );
      b = rational(this.int(3, profile.large ? 299 : 79));
      if (op === "multiplication" || op === "division") {
        a = rational(this.int(3, 29));
        b = rational(this.int(3, 19));
      }
    } else if (kind === "decimal") {
      a = rational(this.int(3, 99), 10n ** this.int(1, 3));
      b = rational(this.int(2, 75), 10n ** this.int(1, 3));
    } else {
      const denominator = this.int(2, 9);
      a = rational(this.int(1, 17), denominator);
      b = rational(this.int(1, 17), denominator * this.int(1, 4));
      if (op === "multiplication") {
        a = rational(this.int(2, 18));
        b = rational(this.int(1, 7), denominator);
      }
      if (op === "division") {
        a = rational(this.int(2, 15));
        b = rational(this.int(1, 7), denominator);
      }
      if (a.d === 1n && b.d === 1n) b = rational(1n, denominator);
    }
    if (op === "subtraction" && a.n * b.d <= b.n * a.d)
      a = calculate("addition", a, b);
    // Build divisions from a quotient and divisor, so decimal results terminate.
    if (op === "division") a = calculate("multiplication", a, b);
    const result = calculate(op, a, b);
    const blank = profile.blank as NonNullable<Question["optiver"]>["blank"];
    const answer = blank === "left" ? a : blank === "right" ? b : result;
    const text = (v: Rational) =>
      kind === "fraction" && index % 3 === 1 && v.n > v.d && v.d !== 1n
        ? `${v.n / v.d} ${v.n % v.d}/${v.d}`
        : rationalText(v, kind !== "fraction");
    const expected = text(answer);
    const choices = new Map<string, string>([[rationalText(answer), expected]]);
    const decimalTraps = [
      rational(answer.n * 10n, answer.d),
      rational(answer.n, answer.d * 10n),
      rational(answer.n * 100n, answer.d),
    ];
    const step =
      kind === "integer"
        ? rational(1n)
        : kind === "decimal"
          ? rational(1n, 10n ** this.int(1, 3))
          : rational(1n, answer.d === 1n ? 4n : answer.d);
    let attempt = 0;
    while (choices.size < 4) {
      const integerOffsets =
        answer.n >= 200n
          ? [1n, 10n, 20n, 100n]
          : answer.n >= 20n
            ? [1n, 2n, 10n]
            : [1n, 2n, 3n, 4n];
      const offset =
        kind === "integer" && attempt < 30
          ? integerOffsets[
              Number(this.random.below(BigInt(integerOffsets.length)))
            ] * (this.random.below(2n) ? -1n : 1n)
          : BigInt((attempt % 2 ? -1 : 1) * (1 + Math.floor(attempt / 2)));
      const candidate =
        kind === "decimal" &&
        attempt < 3 &&
        (op === "division" || op === "multiplication")
          ? decimalTraps[attempt]
          : kind === "fraction" && attempt === 0 && answer.n !== answer.d
            ? rational(answer.d, answer.n)
            : calculate("addition", answer, rational(step.n * offset, step.d));
      attempt++;
      if (candidate.n <= 0n) continue;
      choices.set(rationalText(candidate), text(candidate));
    }
    const options = [...choices.values()];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Number(this.random.below(BigInt(i + 1)));
      [options[i], options[j]] = [options[j], options[i]];
    }
    return {
      id: `q-${index}`,
      index,
      operation: op,
      groupId: `optiver-${op}`,
      left: text(a),
      right: text(b),
      expected,
      selection: {
        operationBasisPoints: null,
        groupBasisPoints: null,
        validPairCount: null,
      },
      optiver: {
        kind,
        blank,
        result: text(result),
        options,
        profileIndex: index,
      },
    };
  }
}
