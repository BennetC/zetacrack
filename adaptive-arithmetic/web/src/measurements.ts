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
  inputChangeCount: number;
}
export interface SavedSession {
  id: string;
  config: Config;
  measurementVersion: string | null;
  events: Observation[];
  questions: DerivedQuestion[];
  summary: {
    correctQuestionCount: number;
    validCorrectAnswerCount: number;
    medianCorrectAnswerTimeMs: number | null;
    meanCorrectAnswerTimeMs: number | null;
  };
  dataQualityWarnings: QualityWarning[];
}

export const displaySeconds = (ms: number | null | undefined) =>
  ms == null ? "—" : `${(ms / 1000).toFixed(2)}s`;
