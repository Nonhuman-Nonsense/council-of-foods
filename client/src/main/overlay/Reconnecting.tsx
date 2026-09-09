import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { reloadApp } from "@/navigation";
import { useElapsedSince, useMobile } from '@/utils';
import { useCouncilSettings } from "@/settings/councilSettings";
import { useErrorStore } from "./errorStore";
import Loading from "../Loading";

export type { ConnectionErrorSource, SetConnectionError } from "./errorStore";

/** How long a busy provider must keep us waiting before the overlay says so. */
export const BUSY_NOTICE_DELAY_MS = 10_000;

/** Unattended installations: hard-restart if reconnect never succeeds. */
const RECONNECTING_RESTART_MS = 2 * 60 * 1000;

/**
 * Reconnecting Overlay
 *
 * Displayed when the socket connection is lost.
 * Shows a loading spinner and a standardized error message.
 * Automatically disappears when connection is restored (handled by errorStore).
 * Where the app restarts itself, reloads to root after prolonged failure.
 */
function Reconnecting(): React.ReactElement {
  const isMobile = useMobile();
  const { t } = useTranslation();
  const { capabilities } = useCouncilSettings();
  // Nothing is lost when the provider is merely at capacity, and telling a
  // room full of people the connection dropped sends someone to check a cable.
  // Held back for a few seconds: a squeeze that clears on the first retry needs
  // no explaining, and swapping the copy instantly would flicker.
  const waited = useElapsedSince(useErrorStore((s) => s.busySince), BUSY_NOTICE_DELAY_MS);
  const busy = useErrorStore((s) => s.connectionBusy) && waited;

  useEffect(() => {
    if (!capabilities.autoRestart) return;

    const timer = window.setTimeout(() => {
      void reloadApp();
    }, RECONNECTING_RESTART_MS);

    return () => clearTimeout(timer);
  }, [capabilities.autoRestart]);

  return (
    <div>
      <div style={{ position: "relative", display: "flex", justifyContent: "center", transform: "translateY(-50%)", height: `${(isMobile ? 100 : 150) / 2}px` }}>
        <Loading />
      </div>
      <h2>{busy ? t('error.busy') : t('error.connection')}</h2>
      <p>{busy ? t('error.busyRetrying') : t('error.reconnecting')}</p>
    </div>
  );
}

export default Reconnecting;
