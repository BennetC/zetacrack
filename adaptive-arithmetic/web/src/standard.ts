import {
  FixedStandardPolicy,
  OPERATIONS,
  SeededRandom,
  type Config,
  type Question,
  type SelectionPolicy,
} from "./domain";

export const STANDARD_GENERATOR_VERSION = "zetamac-reverse-v1";
export const STANDARD_POLICY_VERSION = "equal-operations-v1";
export const STANDARD_CONTENT_VERSION = "zetamac-default-v1";
export const CUSTOM_CONTENT_VERSION = "custom-grid-v1";
export function standardConfig(): Config {
  return {
    version: 1,
    operations: OPERATIONS.map((operation) => ({
      id: operation,
      version: 1,
      share: "25",
      groups: [
        {
          id: "standard-" + operation,
          version: 1,
          name: "Standard " + operation,
          share: "100",
          first: {
            min: "2",
            max: ["multiplication", "division"].includes(operation)
              ? "12"
              : "100",
            decimalPlaces: 0,
          },
          second: { min: "2", max: "100", decimalPlaces: 0 },
          allowNegative: false,
        },
      ],
    })),
    session: { format: "timed", durationSeconds: "120", countdown: false },
  };
}
export interface QuestionSource {
  next(): Question;
}
// Selection and uniform operand generation remain independent, replaceable steps.
export function standardQuestion(
  operation: Question["operation"],
  a: bigint,
  b: bigint,
) {
  if (operation === "addition")
    return {
      left: a.toString(),
      right: b.toString(),
      expected: (a + b).toString(),
    };
  if (operation === "subtraction")
    return {
      left: (a + b).toString(),
      right: a.toString(),
      expected: b.toString(),
    };
  if (operation === "multiplication")
    return {
      left: a.toString(),
      right: b.toString(),
      expected: (a * b).toString(),
    };
  return {
    left: (a * b).toString(),
    right: a.toString(),
    expected: b.toString(),
  };
}
export class StandardGenerator implements QuestionSource {
  private random: SeededRandom;
  private index = 0;
  private config = standardConfig();
  constructor(
    seed: string,
    private policy: SelectionPolicy = new FixedStandardPolicy(),
  ) {
    this.random = new SeededRandom(seed);
  }
  next(): Question {
    const { operation, group } = this.policy.choose(this.config, this.random);
    const product =
      operation.id === "multiplication" || operation.id === "division";
    const a = 2n + this.random.below(product ? 11n : 99n),
      b = 2n + this.random.below(99n);
    const index = this.index++;
    return {
      id: `q-${index}`,
      index,
      operation: operation.id,
      groupId: group.id,
      ...standardQuestion(operation.id, a, b),
      selection: {
        operationBasisPoints: 2500,
        groupBasisPoints: 10000,
        validPairCount: (product ? 11n * 99n : 99n * 99n).toString(),
      },
    };
  }
}
