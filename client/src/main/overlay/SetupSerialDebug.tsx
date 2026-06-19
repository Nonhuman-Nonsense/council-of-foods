import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  SERIAL_DEBUG_LOG_EVENT,
  clearSerialDebugLog,
  getSerialDebugLogText,
} from "@/serial/debugLog";
import { talkButtonService } from "@/museum/talkButton/talkButtonService";
import { usePushToTalkStore } from "@stores/usePushToTalkStore";

function SetupSerialDebug(): React.ReactElement {
  const { t } = useTranslation();
  const serialStatus = usePushToTalkStore((state) => state.serialStatus);
  const serialError = usePushToTalkStore((state) => state.serialError);
  const [logText, setLogText] = useState(getSerialDebugLogText);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const refreshLog = useCallback(() => {
    setLogText(getSerialDebugLogText());
  }, []);

  useEffect(() => {
    refreshLog();
    window.addEventListener(SERIAL_DEBUG_LOG_EVENT, refreshLog);
    return () => {
      window.removeEventListener(SERIAL_DEBUG_LOG_EVENT, refreshLog);
    };
  }, [refreshLog]);

  async function copyLog(): Promise<void> {
    const serviceState = talkButtonService.getDebugState();
    const snapshot = [
      "=== Talk button debug snapshot ===",
      `serialStatus: ${serialStatus}`,
      `serialError: ${serialError ?? "(none)"}`,
      `service: ${JSON.stringify(serviceState)}`,
      `url: ${window.location.href}`,
      `userAgent: ${navigator.userAgent}`,
      "=== Log ===",
      getSerialDebugLogText(),
    ].join("\n");

    try {
      await navigator.clipboard.writeText(snapshot);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 2000);
  }

  return (
    <div
      data-testid="setup-serial-debug"
      style={{
        width: "100%",
        marginTop: "12px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
      }}
    >
      <h4 style={{ margin: 0 }}>{t("setup.serial.debugTitle")}</h4>
      <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.8, textAlign: "center" }}>
        {t("setup.serial.debugHint")}
      </p>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
        <button type="button" data-testid="setup-serial-debug-copy" onClick={() => void copyLog()}>
          {copyState === "copied"
            ? t("setup.serial.debugCopied")
            : copyState === "failed"
              ? t("setup.serial.debugCopyFailed")
              : t("setup.serial.debugCopy")}
        </button>
        <button
          type="button"
          data-testid="setup-serial-debug-clear"
          onClick={() => {
            clearSerialDebugLog();
            refreshLog();
          }}
        >
          {t("setup.serial.debugClear")}
        </button>
        <button
          type="button"
          data-testid="setup-serial-debug-sync"
          onClick={() => void talkButtonService.sync("setup-manual")}
        >
          {t("setup.serial.debugRetry")}
        </button>
      </div>
      <pre
        data-testid="setup-serial-debug-log"
        style={{
          width: "100%",
          maxHeight: "180px",
          overflow: "auto",
          margin: 0,
          padding: "8px",
          fontSize: "11px",
          lineHeight: 1.35,
          textAlign: "left",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: "rgba(0,0,0,0.15)",
          borderRadius: "4px",
        }}
      >
        {logText || t("setup.serial.debugEmpty")}
      </pre>
    </div>
  );
}

export default SetupSerialDebug;
