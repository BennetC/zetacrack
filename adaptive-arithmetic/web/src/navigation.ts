import { useEffect, useState } from "react";

const EVENT = "arithmetic:location";
export type ParamChanges = Record<string, string | null>;

export function updateLocation(changes: ParamChanges, replace = false) {
  const params = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(changes)) {
    if (value == null || value === "") params.delete(key);
    else params.set(key, value);
  }
  const url = `${location.pathname}?${params}${location.hash}`;
  if (url === location.pathname + location.search + location.hash) return;
  history[replace ? "replaceState" : "pushState"](null, "", url);
  window.dispatchEvent(new Event(EVENT));
}

export function useLocationParams() {
  const [search, setSearch] = useState(() => location.search);
  useEffect(() => {
    const sync = () => setSearch(location.search);
    window.addEventListener("popstate", sync);
    window.addEventListener(EVENT, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(EVENT, sync);
    };
  }, []);
  return new URLSearchParams(search);
}

export function invalidDateRange(after: string, before: string) {
  return Boolean(after && before && after > before);
}

export function recentDateRange(days: number, now = new Date()) {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return {
    after: start.toISOString().slice(0, 10),
    before: end.toISOString().slice(0, 10),
  };
}
