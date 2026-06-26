import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMobile } from '@/utils';
import { useRouting } from "@/routing";
import { useCouncilSettings } from "@/settings/councilSettings";
import Loading from "../Loading";

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
