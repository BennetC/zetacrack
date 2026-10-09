import type { Config, Preset } from "./domain";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      typeof data.detail === "string"
        ? data.detail
        : "The setup could not be saved. Check the highlighted settings.",
      response.status,
    );
  return data;
}
export const loadSetup = () =>
  request<{ presets: Preset[]; lastConfig: Config | null }>("/api/setup");
