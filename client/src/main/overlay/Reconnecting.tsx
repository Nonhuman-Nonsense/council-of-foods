import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMobile } from '@/utils';
import { useRouting } from "@/routing";
import { useCouncilSettings } from "@/settings/councilSettings";
import Loading from "../Loading";

// ---------------------------------------------------------------------------
// Source-tracked connection error state
// ---------------------------------------------------------------------------

export type ConnectionErrorSource = "socket" | "voice-guide" | "meta-agent";
export type SetConnectionError = (source: ConnectionErrorSource, active: boolean) => void;

/**
 * App-level connection error state, tracked by source so multiple subsystems
 * (socket, voice guide, meta agent) can independently raise and clear the
 * error without accidentally clearing each other's state.
 *
 * Mirrors the shape of `useUnrecoverableError` in `CouncilError.tsx`.
 */
export function useConnectionError(): {
  connectionError: boolean;
  setConnectionError: SetConnectionError;
} {
  const [activeSources, setActiveSources] = useState<ReadonlySet<ConnectionErrorSource>>(
    () => new Set(),
  );

  const setConnectionError = useCallback<SetConnectionError>((source, active) => {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (active) {
        next.add(source);
      } else {
        next.delete(source);
      }
      return next;
    });
  }, []);

  return { connectionError: activeSources.size > 0, setConnectionError };
}

/** Museum kiosks: hard-restart if reconnect never succeeds. */
const MUSEUM_RECONNECTING_RESTART_MS = 2 * 60 * 1000;

/**
 * Reconnecting Overlay
 *
 * Displayed when the socket connection is lost.
 * Shows a loading spinner and a standardized error message.
 * Automatically disappears when connection is restored (handled by parent logic).
 * In museum mode, reloads to root after prolonged failure.
 */
function Reconnecting(): React.ReactElement {
  const isMobile = useMobile();
  const { t } = useTranslation();
  const { rootPath } = useRouting();
  const { isMuseumMode } = useCouncilSettings();

  useEffect(() => {
    if (!isMuseumMode) return;

    const timer = window.setTimeout(() => {
      window.location.href = rootPath;
    }, MUSEUM_RECONNECTING_RESTART_MS);

    return () => clearTimeout(timer);
  }, [isMuseumMode, rootPath]);

  return (
    <div>
      <div style={{ position: "relative", display: "flex", justifyContent: "center", transform: "translateY(-50%)", height: `${(isMobile ? 100 : 150) / 2}px` }}>
        <Loading />
      </div>
      <h2>{t('error.connection')}</h2>
      <p>{t('error.reconnecting')}</p>
    </div>
  );
}

export default Reconnecting;
