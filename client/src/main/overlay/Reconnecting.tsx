import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { reloadApp } from "@/navigation";
import { useMobile } from '@/utils';
import { useCouncilSettings } from "@/settings/councilSettings";
import Loading from "../Loading";

export type { ConnectionErrorSource, SetConnectionError } from "./errorStore";

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
      <h2>{t('error.connection')}</h2>
      <p>{t('error.reconnecting')}</p>
    </div>
  );
}

export default Reconnecting;
