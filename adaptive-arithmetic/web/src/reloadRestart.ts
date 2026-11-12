import { configsEqual, validateConfig, type Config } from "./domain";
import { standardConfig } from "./standard";
import { optiverConfig, type PlayMode } from "./optiver";

export const RESTART_KEY = "arithmetic.reload-restart.v1";
export interface ReloadRestart {
  replayOf?: string;
  challengeSeed?: string;
  version: 1;
  sessionId: string;
  mode: PlayMode;
  config: Config;
}

export function parseReloadRestart(raw: string): ReloadRestart | null {
  try {
    const value = JSON.parse(raw) as ReloadRestart;
    if (
      value.version !== 1 ||
      typeof value.sessionId !== "string" ||
      !value.sessionId ||
      !["standard", "custom", "optiver"].includes(value.mode) ||
      Object.keys(validateConfig(value.config)).length ||
      (value.mode === "standard" &&
        !configsEqual(value.config, standardConfig())) ||
      (value.mode === "optiver" && !configsEqual(value.config, optiverConfig()))
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

// Intent belongs to this tab and this navigation, not to any shared journal.
export function peekReloadRestart(view: string): ReloadRestart | null {
  const raw = sessionStorage.getItem(RESTART_KEY);
  const navigation = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  if (
    !raw ||
    navigation?.type !== "reload" ||
    !["standard", "custom", "optiver"].includes(view)
  )
    return null;
  return parseReloadRestart(raw);
}

export function consumeReloadRestart(view: string): ReloadRestart | null {
  const intent = peekReloadRestart(view);
  sessionStorage.removeItem(RESTART_KEY);
  return intent;
}

export function rememberReloadRestart(value: ReloadRestart) {
  sessionStorage.setItem(RESTART_KEY, JSON.stringify(value));
}

export function clearReloadRestart(sessionId: string) {
  const raw = sessionStorage.getItem(RESTART_KEY);
  if (raw && parseReloadRestart(raw)?.sessionId === sessionId)
    sessionStorage.removeItem(RESTART_KEY);
}
