import type { Config, Question } from "./domain";
import type { Observation } from "./sessionRecovery";

export const MEASUREMENT_VERSION = "response-timing-v1";
export interface QualityWarning {
  code: string;
  message: string;
  sequence: number | null;
}
export interface DerivedQuestion {
  id: string | null;
  index: number | null;
  groupId: string | null;
  groupName: string | null;
  presentationSequence: number;
  operation: Question["operation"] | null;
  left: string | null;
  right: string | null;
  expected: string | null;
  outcome: "correct" | "unfinished";
  correctAnswerTimeMs: number | null;
  firstInputTimeMs: number | null;
  observedUnfinishedDurationMs: number | null;
  unfinishedDurationIsLowerBound: boolean | null;
  lastInput: string | null;
  acceptedInput: string | null;
  inputChangeCount: number;
}
export interface SavedSession {
  replayOf?: string | null;
  annotations?: {
    presentationSequence: number;
    label: string;
    revision: number;
  }[];
  id: string;
  seed: string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  generatorVersion: string;
  policyVersion: string;
  mode: "standard" | "custom" | null;
  contentVersion: string | null;
  status: "open" | "ended";
  terminationState: "ended" | "ongoing" | "incomplete";
  terminationReason: string | null;
  endTimeKnown: boolean;
  cohortKey: string;
  cohortLabel: string;
  score: number;
  scoreState: "full" | "partial";
  comparisonEligible: boolean;
  comparisonExclusionReasons: string[];
  config: Config;
  measurementVersion: string | null;
  events: Observation[];
  questions: DerivedQuestion[];
  summary: {
    presentedQuestionCount: number;
    unfinishedQuestionCount: number;
    correctQuestionCount: number;
    validCorrectAnswerCount: number;
    medianCorrectAnswerTimeMs: number | null;
    meanCorrectAnswerTimeMs: number | null;
  };
  dataQualityWarnings: QualityWarning[];
}

export const displaySeconds = (ms: number | null | undefined) =>
  ms == null ? "—" : `${(ms / 1000).toFixed(2)}s`;
