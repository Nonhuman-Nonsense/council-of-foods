import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useMobile, dvh } from "@/utils";
import parse from 'html-react-parser';
import { marked } from "marked";
import { jsPDF } from "jspdf";
import { useTranslation, Trans } from "react-i18next";
import { useCouncilSettings } from "@/settings/councilSettings";
import { useRouting } from "@/routing";
import { useButton } from "@/museum/button/useButton";
import { useButtonBanner } from "@/museum/button/useButtonBanner";
import {
  SUMMARY_RETURN_TO_ROOT_MS,
  useAutoplayStore,
} from "@/autoplay/autoplayStore";
import {
  computeTeleprompterBottomPadding,
  computeTeleprompterTopPadding,
  useAudioSyncedScroll,
  type SummaryPlaybackState,
} from "@council/summaryScrollSync";
import { externalLinks } from "@/i18n/externalLinks";
import { QRCodeCanvas } from 'qrcode.react';
import councilLogoWhite from "@assets/logos/council_logo_white.svg";
import councilLogo from "@assets/logos/council_logo.png";

export interface SummaryData {
  text: string;
}

interface SummaryProps {
  summary: SummaryData;
  meetingId: string | number | null;
  audioContext?: React.RefObject<AudioContext | null>;
  summaryPlayback?: SummaryPlaybackState;
}

/**
 * Summary Overlay
 * 
 * Displays a formatted summary of the meeting formatted as an official protocol.
 * Generates a text-based view and offers a PDF download option.
 * 
 * Core Logic:
 * - Renders markdown summary provided by server.
 * - Uses `jspdf` to generate a printable PDF from a hidden HTML element (`PDFToPrint`).
 */
function Summary({
  summary,
  meetingId,
  audioContext,
  summaryPlayback = null,
}: SummaryProps): React.ReactElement {
  const isMobile = useMobile();
  const protocolRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [teleprompterBottomPad, setTeleprompterBottomPad] = useState(0);
  const fallbackAudioContext = useRef<AudioContext | null>(null);
  const prevPressedRef = useRef(false);
  const navigate = useNavigate();
  const { rootPath } = useRouting();
  const { t } = useTranslation();
  const { isMuseumMode, agentMode } = useCouncilSettings();
  const isButtonSummaryMode = isMuseumMode && agentMode === "ptt";
  const teleprompterTopPad = isMuseumMode ? computeTeleprompterTopPadding(isMobile) : 0;
  const autoplayPhase = useAutoplayStore((state) => state.phase);
  const summaryProtocolFinished = useAutoplayStore((state) => state.summaryProtocolFinished);
  const button = useButton("summary");
  const showDownload = !isMuseumMode;

  useEffect(() => {
    if (!isButtonSummaryMode) {
      return;
    }
    button.claim();
    return () => button.release();
  }, [isButtonSummaryMode, button.claim, button.release]);

  useEffect(() => {
    if (!isButtonSummaryMode) {
      return;
    }
    button.setLed("pulse");
  }, [isButtonSummaryMode, button.setLed]);

  useButtonBanner({
    owner: "summary",
    sessionActive: isButtonSummaryMode,
    micOpen: false,
    isConnecting: false,
    bannerImmediate: true,
    messageKey: "summary.banner.pressToRestart",
  });

  useEffect(() => {
    if (!isButtonSummaryMode) {
      return;
    }

    const pressed = button.pressed;
    const wasPressed = prevPressedRef.current;
    prevPressedRef.current = pressed;

    if (pressed && !wasPressed) {
      navigate(rootPath);
    }
  }, [button.pressed, isButtonSummaryMode, navigate, rootPath]);

  useEffect(() => {
    if (!isButtonSummaryMode || autoplayPhase === "active") {
      return;
    }
    if (!summaryProtocolFinished) {
      return;
    }

    const timerId = window.setTimeout(() => {
      navigate(rootPath);
    }, SUMMARY_RETURN_TO_ROOT_MS);

    return () => window.clearTimeout(timerId);
  }, [
    autoplayPhase,
    isButtonSummaryMode,
    navigate,
    rootPath,
    summaryProtocolFinished,
  ]);

  useAudioSyncedScroll({
    scrollRef,
    enabled: isMuseumMode,
    playback: summaryPlayback,
    audioContext: audioContext ?? fallbackAudioContext,
    bottomPadding: teleprompterBottomPad,
  });

  useLayoutEffect(() => {
    if (!isMuseumMode) {
      setTeleprompterBottomPad(0);
      return;
    }

    const scrollEl = scrollRef.current;
    if (!scrollEl) {
      return;
    }

    const updateBottomPadding = (): void => {
      const el = scrollRef.current;
      if (!el) {
        return;
      }
      setTeleprompterBottomPad(computeTeleprompterBottomPadding(el.clientHeight));
    };

    updateBottomPadding();

    const observer = new ResizeObserver(updateBottomPadding);
    observer.observe(scrollEl);
    return () => observer.disconnect();
  }, [isMuseumMode, summary.text, isMobile]);

  const handleCreatePdf = (): void => {
    import("../../Tinos.js").then(() => {
      const pdf = new jsPDF("p", "pt", "a4");
      pdf.setFont("Tinos");
      if (protocolRef.current) {
        pdf.html(protocolRef.current, {
          callback: function (_doc: jsPDF) {
            pdf.save(`Council of Foods Meeting Summary #${meetingId}.pdf`);
          },
          autoPaging: 'text',
          margin: [50, 50, 50, 50]
        });
      }
    });
  };

  const downloadRowHeight = isMobile ? 30 : 40;
  const controlsClearance = isMobile ? 45 : 56;

  const summaryWrapper: React.CSSProperties = {
    height: showDownload
      ? `calc(100% - ${downloadRowHeight}px)`
      : "100%",
    overflowY: "auto",
    mask: "linear-gradient(to bottom, rgb(0, 0, 0) 0, rgb(0,0,0) 93%, rgba(0,0,0, 0) 100% ) repeat-x",
  };

  const wrapper: React.CSSProperties = isMuseumMode
    ? {
      position: "fixed",
      top: 0,
      left: "50%",
      transform: "translateX(-50%)",
      height: `100${dvh}`,
      width: isMobile ? "600px" : "800px",
      margin: 0,
      minHeight: 0,
    }
    : {
      maxHeight: isMobile
        ? `calc(100${dvh} - 45px - 10px - ${downloadRowHeight}px)`
        : `calc(100${dvh} - 60px - 56px - 20px - ${downloadRowHeight}px)`,
      minHeight: "255px",
      marginBottom: isMobile ? "45px" : "56px",
      marginTop: isMobile ? "10px" : "20px",
      paddingBottom: controlsClearance,
      width: isMobile ? "600px" : "800px",
    };

  const buttonsWrapper: React.CSSProperties = {
    height: isMobile ? "30px" : "40px",
    display: 'flex',
    flexDirection: 'row',
    alignItems: "center",
    justifyContent: "center"
  };

  const protocolStyle: React.CSSProperties = {
    textAlign: "left",
    whiteSpace: "pre-wrap",
  };

  const teleprompterContentStyle: React.CSSProperties = isMuseumMode
    ? {
      paddingTop: teleprompterTopPad,
      paddingBottom: teleprompterBottomPad,
    }
    : {};

  return (
    <>
      <div style={wrapper} data-testid="summary-wrapper">
        <div
          ref={scrollRef}
          style={summaryWrapper}
          className={isMuseumMode ? "scroll scroll--hide-scrollbar" : "scroll"}
          data-testid="summary-protocol"
        >
          <div
            style={teleprompterContentStyle}
            data-testid="summary-teleprompter-content"
          >
            <hr />
            <div style={{ display: "flex", flexDirection: "row", margin: "20px 0", justifyContent: "space-between" }}>
              <div>
                <img style={{ width: isMobile ? '80px' : '110px', paddingRight: "10px" }} src={councilLogoWhite} alt="council of foods logo" />
              </div>
              <div style={{ display: "flex", flexDirection: "column", textAlign: "left", flex: "1", paddingLeft: "15px" }}>
                <h2 style={{ margin: 0 }}>{t('app.council').toUpperCase()}</h2>
                <h3 style={{ margin: 0 }}>{t('app.meeting')} #{meetingId}</h3>
              </div>
              <div>
                <a href={window.location.href}><QRCodeCanvas value={window.location.href} bgColor="rgba(0,0,0,0)" fgColor="#ffffff" style={{ height: isMobile ? '50px' : "70px", width: isMobile ? '50px' : "70px", marginRight: "20px" }} /></a>
              </div>
            </div>
            <hr />
            <div id="protocol-container" style={protocolStyle}>
              {/* Ensure synchronous parsing for type safety */}
              {parse(marked.parse(summary.text, { async: false }) as string)}
              <hr /><br />
              <Disclaimer />
            </div>
          </div>
        </div>
        {showDownload && (
          <div style={buttonsWrapper}>
            <button type="button" data-testid="summary-download" onClick={handleCreatePdf}>
              {t('summary.download')}
            </button>
          </div>
        )}
      </div>

      {/* Hidden PDF Template */}
      {showDownload && <div style={{ position: 'absolute', top: '0', display: 'none' }}>
        <div ref={protocolRef} style={{
          position: 'absolute',
          top: '0',
          left: 0,
          backgroundColor: 'white',
          color: 'black',
          textAlign: 'left',
          fontFamily: '"Tinos", sans-serif',
          fontStyle: 'normal',
          overflow: 'hidden',
          width: "480px"
        }}>
          <div style={{ width: "100%" }}>
            <hr />
            <div style={{ height: "52px", position: 'relative' }}>
              <img style={{ width: '70px' }} src={councilLogo} alt="council of foods logo" />
              <h2 style={{ fontSize: '24px', margin: '0', position: 'absolute', left: "80px", top: '2px' }}>{t('app.council').toUpperCase()}</h2>
              <h3 style={{ fontSize: '15px', margin: '0', position: 'absolute', left: "80px", top: "28px" }}>{t('app.meeting')} #{meetingId}</h3>
              <QRCodeCanvas value={window.location.href} style={{ position: 'absolute', right: "10px", top: "2.5px", width: "45px", height: "45px" }} />
            </div>
            <hr />
            <div id="printed-style">
              {/* Ensure synchronous parsing for type safety */}
              {parse(marked.parse(summary.text, { async: false }) as string)}
              <hr /><br />
              <Disclaimer />
            </div>
          </div>
        </div>
      </div>}
    </>
  );
}

function Disclaimer() {
  const { t } = useTranslation();

  return (
    <div>
      <p>{t("disclaimer.intro")}</p>
      <br />
      <ol>
        <li>{t("disclaimer.items.misinformation")}</li>
        <li>{t("disclaimer.items.notResearch")}</li>
        <li>{t("disclaimer.items.takeAction")}</li>
      </ol>
      <br />
      <p>
        <Trans i18nKey="disclaimer.attribution" components={externalLinks} />
      </p>
      <br />
      <p>{t("disclaimer.moreInfo")}</p>
      <br />
    </div>
  );
}

export default Summary;
