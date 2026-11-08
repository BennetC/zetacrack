import {
  splitEqually,
  validateConfig,
  type Config,
  type Operation,
} from "./domain";

export interface RunQuestion {
  index: number;
  id: string;
  presentationSequence: number;
  operation: Operation;
  groupId: string;
  left: string;
  right: string;
  expected: string;
  outcome: string;
  presentedMs: number | null;
  acceptedMs: number | null;
  totalMs: number | null;
  firstMs: number | null;
  entryMs: number | null;
  unfinishedMs: number | null;
  lowerBound: boolean;
  deltaMs: number | null;
  rollingMedianMs: number | null;
  inputChanges: number;
  charactersInserted: number;
  charactersRemoved: number;
  revisionEpisodes: number;
  revisionToAcceptanceMs: number | null;
  hypothesis: string;
  telemetry: string;
  features: string[];
  maxPauseMs: number | null;
  frames: {
    sequence: number;
    value: string;
    atMs: number | null;
    inputType: string;
    revision: boolean;
  }[];
}
export interface RunAnalytics {
  questions: RunQuestion[];
  durationMs: number | null;
  splitWidthMs: number;
  summary: {
    completed: number;
    withInput: number;
    revisedCompleted: number;
    revisedUnfinished: number;
    revisionEpisodes: number;
    charactersRemoved: number;
    charactersInserted: number;
    medianMs: number | null;
    p90Ms: number | null;
    iqrMs: number | null;
    slowestFiveShare: number | null;
  };
  splits: {
    startMs: number;
    endMs: number;
    count: number;
    medianMs: number | null;
    revised: number;
    indices: number[];
  }[];
  timeBreakdown: { label: string; ms: number | null; indices: number[] }[];
  reel: Record<string, number[]>;
}
export interface ProfileRow {
  feature: string;
  count: number;
  medianMs: number;
  firstMedianMs: number | null;
  entryMedianMs: number | null;
  revisedCount: number;
}
export interface ExplorerContext {
  comparisons: {
    id: string;
    createdAt: string;
    score: number;
    runAnalytics: PaceRun;
  }[];
  profile: ProfileRow[];
  profileSessionCount: number;
  baselines: Record<string, { count: number; medianMs: number }>;
}

// Singleton operand grids reproduce chosen arithmetic through the existing exact
// generator. The resulting Custom configuration has its own comparison cohort.
export function practiceSelection(questions: RunQuestion[]): Config {
  if (!questions.length) throw Error("Select at least one question.");
  const grouped = new Map<Operation, RunQuestion[]>();
  for (const q of questions) {
    if (q.totalMs === null && q.unfinishedMs === null)
      throw Error("Select questions with valid arithmetic observations.");
    grouped.set(q.operation, [...(grouped.get(q.operation) || []), q]);
  }
  const operationShares = splitEqually(grouped.size);
  const range = (value: string) => {
    const cleaned = value.includes(".")
      ? value.replace(/0+$/, "").replace(/\.$/, "")
      : value;
    const decimalPlaces = cleaned.split(".")[1]?.length || 0;
    if (decimalPlaces > 3)
      throw Error(
        "This question needs more than the supported three operand decimal places.",
      );
    return { min: cleaned, max: cleaned, decimalPlaces };
  };
  const config: Config = {
    version: 1,
    session: { format: "timed", durationSeconds: "120", countdown: false },
    operations: [...grouped].map(([operation, rows], i) => {
      const shares = splitEqually(rows.length);
      return {
        id: operation,
        version: 1,
        share: operationShares[i],
        groups: rows.map((q, j) => ({
          id: `selected-${operation}-${j}`,
          version: 1,
          name: `${q.left} ${operation} ${q.right}`,
          share: shares[j],
          first: range(operation === "division" ? q.right : q.left),
          second: range(operation === "division" ? q.expected : q.right),
          allowNegative: true,
        })),
      };
    }),
  };
  if (Object.keys(validateConfig(config)).length)
    throw Error(
      "These questions cannot form a supported Custom configuration.",
    );
  return config;
}

export type PaceRun = { questions: { acceptedMs: number | null }[] };

export function scoreAt(run: PaceRun, time: number) {
  return run.questions.filter(
    (q) => q.acceptedMs !== null && q.acceptedMs <= time,
  ).length;
}

// Draw every actual completion as a step, including ties and the exact end.
// Fixed sampling can hide short runs and invent sloping progress between answers.
export function paceSteps(run: PaceRun, duration: number): [number, number][] {
  const times = run.questions
    .flatMap((q) =>
      q.acceptedMs !== null &&
      Number.isFinite(q.acceptedMs) &&
      q.acceptedMs >= 0 &&
      q.acceptedMs <= duration
        ? [q.acceptedMs]
        : [],
    )
    .sort((a, b) => a - b);
  const points: [number, number][] = [[0, 0]];
  times.forEach((time, i) => points.push([time, i], [time, i + 1]));
  points.push([duration, times.length]);
  return points;
}

export function typicalPaceSteps(
  runs: PaceRun[],
  duration: number,
): [number, number][] {
  if (!runs.length)
    return [
      [0, 0],
      [duration, 0],
    ];
  const events = runs
    .flatMap((run, index) =>
      run.questions.flatMap((q) =>
        q.acceptedMs !== null &&
        Number.isFinite(q.acceptedMs) &&
        q.acceptedMs >= 0 &&
        q.acceptedMs <= duration
          ? [{ time: q.acceptedMs, index }]
          : [],
      ),
    )
    .sort((a, b) => a.time - b.time);
  const counts = runs.map(() => 0),
    frequencies = [runs.length];
  const points: [number, number][] = [[0, 0]];
  let value = 0;
  for (let i = 0; i < events.length; ) {
    const time = events[i].time;
    points.push([time, value]);
    do {
      const index = events[i++].index;
      frequencies[counts[index]]--;
      const count = ++counts[index];
      frequencies[count] = (frequencies[count] || 0) + 1;
    } while (i < events.length && events[i].time === time);
    let cumulative = 0,
      lower = -1;
    for (let score = 0; score < frequencies.length; score++) {
      cumulative += frequencies[score] || 0;
      if (lower < 0 && cumulative > Math.floor((runs.length - 1) / 2))
        lower = score;
      if (cumulative > Math.floor(runs.length / 2)) {
        value = (lower + score) / 2;
        break;
      }
    }
    points.push([time, value]);
  }
  points.push([duration, value]);
  return points;
}

export function replayFrameAt(question: RunQuestion, cursor: number) {
  let index = -1;
  for (let i = 0; i < question.frames.length; i++) {
    const at = question.frames[i].atMs;
    if (at !== null && at <= cursor) index = i;
  }
  return index;
}

export function boundedTarget(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100000, Math.max(0, parsed)) : 0;
}
