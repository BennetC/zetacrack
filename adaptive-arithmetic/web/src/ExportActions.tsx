import { useState } from "react";

export function ExportActions({
  sessionId,
  disabled = false,
}: {
  sessionId?: string;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [downloaded, setDownloaded] = useState("");

  async function download(format: "json" | "csv") {
    setPending(format);
    setError("");
    setDownloaded("");
    try {
      const endpoint = sessionId
        ? `/api/sessions/${encodeURIComponent(sessionId)}/export`
        : "/api/exports/sessions";
      const response = await fetch(`${endpoint}?format=${format}`);
      if (!response.ok) throw new Error("Could not export. Try again.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = sessionId
        ? `practice-session-${sessionId}.${format}`
        : `practice-sessions.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Let the browser consume the blob URL before releasing it.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloaded(`${format.toUpperCase()} download ready.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="export-controls">
      {!sessionId && <h3>Export all sessions</h3>}
      <div className="export-buttons">
        {(["json", "csv"] as const).map((format) => (
          <button
            key={format}
            className="secondary-button"
            disabled={disabled || pending !== null}
            onClick={() => void download(format)}
          >
            {pending === format
              ? "Preparing…"
              : `Export ${format.toUpperCase()}`}
          </button>
        ))}
      </div>
      {error && (
        <p className="api-error" role="alert">
          {error}
        </p>
      )}
      {downloaded && (
        <p className="save-status" role="status">
          {downloaded}
        </p>
      )}
    </div>
  );
}
