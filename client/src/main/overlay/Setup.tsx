import { useState } from "react";
import { useMobile, useMobileXs } from "@/utils";
import { useTranslation } from "react-i18next";
import { getPushToTalk, setPushToTalk } from "@/settings/councilSettings";
import { usePushToTalkStore } from "@stores/usePushToTalkStore";

function serialStatusLabel(
  status: ReturnType<typeof usePushToTalkStore.getState>["serialStatus"],
  t: (key: string) => string
): string {
  switch (status) {
    case "connected":
      return t("setup.serial.connected");
    case "connecting":
      return t("setup.serial.connecting");
    case "error":
      return t("setup.serial.error");
    default:
      return t("setup.serial.disconnected");
  }
}

/**
 * Setup Overlay
 *
 * Staff-only global council options at #setup.
 */
function Setup(): React.ReactElement {
  const isMobile = useMobile();
  const isMobileXs = useMobileXs();
  const { t } = useTranslation();
  const [pushToTalk, setPushToTalkState] = useState(getPushToTalk);
  const serialStatus = usePushToTalkStore((state) => state.serialStatus);
  const serialError = usePushToTalkStore((state) => state.serialError);
  const lastSerialLine = usePushToTalkStore((state) => state.lastSerialLine);
  const serialSupported = usePushToTalkStore((state) => state.serialSupported);
  const requestSerialPort = usePushToTalkStore((state) => state.requestSerialPort);
  const connectGrantedPorts = usePushToTalkStore((state) => state.connectGrantedPorts);
  const disconnectSerial = usePushToTalkStore((state) => state.disconnectSerial);

  const containerStyle: React.CSSProperties = {
    width: "96vw",
    height: "70%",
    maxWidth: "850px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    alignItems: "center",
  };

  const gridContainerStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    width: "100%",
    columnGap: "14px",
    rowGap: isMobile ? "3px" : "15px",
    justifyItems: "center",
  };

  const selectButtonStyle: React.CSSProperties = {
    padding: isMobile ? "3px 0" : "6px 0",
    width: "100%",
  };

  const sectionStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    alignItems: "center",
    width: "100%",
    marginTop: isMobile ? "20px" : "30px",
  };

  function selectAlwaysOn(): void {
    setPushToTalkState(false);
    setPushToTalk(false);
  }

  function selectPushToTalk(): void {
    setPushToTalkState(true);
    setPushToTalk(true);
    void connectGrantedPorts();
  }

  return (
    <div style={containerStyle}>
      <h1 style={{ marginBottom: isMobile ? (isMobileXs ? "0px" : "5px") : undefined }}>
        {t("setup.title")}
      </h1>

      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0 }}>{t("setup.voiceGuide")}</h3>

        <div style={gridContainerStyle}>
          <button
            type="button"
            data-testid="voice-guide-always-on"
            className={!pushToTalk ? "selected " : ""}
            onClick={selectAlwaysOn}
            style={selectButtonStyle}
          >
            {t("setup.alwaysOn")}
          </button>
          <button
            type="button"
            data-testid="voice-guide-push-to-talk"
            className={pushToTalk ? "selected " : ""}
            onClick={selectPushToTalk}
            style={selectButtonStyle}
          >
            {t("setup.pushToTalk")}
          </button>
        </div>
      </div>

      {pushToTalk ? (
        <div style={sectionStyle}>
          <h3 style={{ marginTop: 0 }}>{t("setup.serial.title")}</h3>
          {!serialSupported ? (
            <p style={{ marginTop: 0 }}>{t("setup.serial.unsupported")}</p>
          ) : (
            <>
              <p style={{ marginTop: 0 }}>
                {t("setup.serial.status")}: {serialStatusLabel(serialStatus, t)}
                {serialError ? ` — ${serialError}` : ""}
              </p>
              {lastSerialLine ? (
                <p style={{ marginTop: 0 }}>
                  {t("setup.serial.lastEvent")}: {lastSerialLine}
                </p>
              ) : null}
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
                <button type="button" data-testid="setup-serial-connect" onClick={() => void requestSerialPort()}>
                  {t("setup.serial.connect")}
                </button>
                <button type="button" data-testid="setup-serial-disconnect" onClick={() => void disconnectSerial()}>
                  {t("setup.serial.disconnect")}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default Setup;
