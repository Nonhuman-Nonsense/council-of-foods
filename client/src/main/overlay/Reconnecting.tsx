import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { reloadApp } from "@/navigation";
import { useElapsedSince, useMobile } from '@/utils';
import { useCouncilSettings } from "@/settings/councilSettings";
import { connectionLostCopy, useOnline } from "./connectionCopy";
import { useErrorStore } from "./errorStore";
import Loading from "../Loading";

export type { ConnectionErrorSource, SetConnectionError } from "./errorStore";

/** How long a busy provider must keep us waiting before the overlay says so. */
export const BUSY_NOTICE_DELAY_MS = 10_000;

/**
 * How long a lost connection must stay lost before the overlay says what to check. A blip or a
 * server restart is over sooner, and needs nobody to go and look at a cable.
 */
export const CONNECTION_NOTICE_DELAY_MS = 30_000;

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
  // No network at all is certain at once; anything else only once it has gone on.
  const online = useOnline();
  const [lostSince] = useState(() => Date.now());
  const lostLong = useElapsedSince(lostSince, CONNECTION_NOTICE_DELAY_MS);
  const lost = !online || lostLong ? connectionLostCopy(online) : null;

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
      <h2>{busy ? t('error.busy') : lost ? t(lost.title) : t('error.connection')}</h2>
      <p>{busy ? t('error.busyRetrying') : lost ? t(lost.detail) : t('error.reconnecting')}</p>
    </div>
  );
}

export default Reconnecting;
