import type { ReactElement } from "react";

type VoiceGuideOverlayProps = {
  status: "idle" | "connecting" | "connected" | "error";
  error: string | null;
  lastCaption: string | null;
  lastUserTranscript: string | null;
  onStart: () => void;
  onStop: () => void;
};

export default function VoiceGuideOverlay(props: VoiceGuideOverlayProps): ReactElement {
  const { status, error, lastCaption, lastUserTranscript, onStart, onStop } = props;

  const isActive = status === "connecting" || status === "connected";

  const containerStyle: React.CSSProperties = {
    position: "fixed",
    right: "12px",
    bottom: "12px",
    zIndex: 9999,
    width: "min(420px, calc(100vw - 24px))",
    padding: "10px 12px",
    borderRadius: "12px",
    background: "rgba(0,0,0,0.55)",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "white",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  };

  const pillStyle: React.CSSProperties = {
    fontSize: "12px",
    opacity: 0.9,
    padding: "2px 8px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.2)",
  };

  const label =
    status === "idle"
      ? "Voice guide: idle"
      : status === "connecting"
        ? "Voice guide: connecting…"
        : status === "connected"
          ? "Voice guide: listening"
          : "Voice guide: error";

  return (
    <div style={containerStyle} aria-live="polite">
      <div style={rowStyle}>
        <div style={pillStyle}>{label}</div>
        <div style={{ display: "flex", gap: "8px" }}>
          {!isActive ? (
            <button type="button" onClick={onStart}>
              Start
            </button>
          ) : (
            <button type="button" onClick={onStop}>
              Stop
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div style={{ marginTop: "8px", fontSize: "12px", opacity: 0.95 }}>
          <b>Error:</b> {error}
        </div>
      ) : null}

      {lastUserTranscript ? (
        <div style={{ marginTop: "8px", fontSize: "12px", opacity: 0.9 }}>
          <b>You:</b> {lastUserTranscript}
        </div>
      ) : null}

      {lastCaption ? (
        <div style={{ marginTop: "6px", fontSize: "12px", opacity: 0.9 }}>
          <b>Guide:</b> {lastCaption}
        </div>
      ) : null}
    </div>
  );
}

