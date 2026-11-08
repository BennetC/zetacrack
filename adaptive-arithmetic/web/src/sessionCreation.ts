import { validateConfig, type Config } from "./domain";

export const CREATION_PREFIX = "arithmetic.creating.";
export interface CreationRequest {
  replayOf?: string;
  creationKey: string;
  config: Config;
  seed: string;
  generatorVersion: string;
  policyVersion: string;
  measurementVersion: string;
  mode: "standard" | "custom";
  contentVersion: string;
}

export function readCreation(raw: string): CreationRequest {
  const value = JSON.parse(raw) as CreationRequest;
  if (
    !value ||
    typeof value.creationKey !== "string" ||
    !value.creationKey ||
    typeof value.seed !== "string" ||
    !value.seed ||
    !["standard", "custom"].includes(value.mode) ||
    Object.keys(validateConfig(value.config)).length ||
    ![
      value.generatorVersion,
      value.policyVersion,
      value.measurementVersion,
      value.contentVersion,
    ].every((v) => typeof v === "string" && v)
  ) {
    throw new Error(
      "The pending start information is invalid and has been retained.",
    );
  }
  return value;
}

export function rememberCreation(value: CreationRequest) {
  localStorage.setItem(
    CREATION_PREFIX + value.creationKey,
    JSON.stringify(value),
  );
}

export function forgetCreation(value: CreationRequest) {
  localStorage.removeItem(CREATION_PREFIX + value.creationKey);
}
