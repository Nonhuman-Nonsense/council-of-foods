import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useMobile, dvh } from "@/utils";
import parse from 'html-react-parser';
import { marked } from "marked";
import { useTranslation } from "react-i18next";
import { useCouncilSettings } from "@/settings/councilSettings";
import { useRouting } from "@/navigation";
import { useErrorStore } from "@main/overlay/errorStore";
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
import { QRCodeCanvas } from 'qrcode.react';
import councilLogoWhite from "@assets/logos/council_logo_white.svg";
import Disclaimer from "@council/protocol/Disclaimer";
import ProtocolDocument from "@council/protocol/ProtocolDocument";
import { createProtocolPdf } from "@council/protocol/protocolPdf";

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
 * - Downloads a PDF of the hidden {@link ProtocolDocument} via `createProtocolPdf`.
 */
function Summary({
  summary,
  meetingId,
  audioContext,
  summaryPlayback = null,
}: SummaryProps): React.ReactElement {
  const connectionError = useErrorStore((s) => s.connectionError);
  const isMobile = useMobile();
  const protocolRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [teleprompterBottomPad, setTeleprompterBottomPad] = useState(0);
  const fallbackAudioContext = useRef<AudioContext | null>(null);
  const prevPressedRef = useRef(false);
  const navigate = useNavigate();
  const { rootPath } = useRouting();
  const { t } = useTranslation();
  const { capabilities } = useCouncilSettings();
  const isButtonSummaryMode = capabilities.teleprompter;
  const teleprompterTopPad = isButtonSummaryMode ? computeTeleprompterTopPadding(isMobile) : 0;
  const autoplayPhase = useAutoplayStore((state) => state.phase);
  const summaryProtocolFinished = useAutoplayStore((state) => state.summaryProtocolFinished);
  const button = useButton("summary");
  const showDownload = capabilities.browserUi;

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
    button.setArmed(true);
  }, [isButtonSummaryMode, button.setArmed]);

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
    if (!capabilities.autoReturnToLanding || autoplayPhase === "active") {
      return;
    }
    if (connectionError) {
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
    capabilities.autoReturnToLanding,
    connectionError,
    navigate,
    rootPath,
    summaryProtocolFinished,
  ]);

  useAudioSyncedScroll({
    scrollRef,
    enabled: isButtonSummaryMode,
    playback: summaryPlayback,
    audioContext: audioContext ?? fallbackAudioContext,
    bottomPadding: teleprompterBottomPad,
  });

  useLayoutEffect(() => {
    if (!isButtonSummaryMode) {
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
  }, [isButtonSummaryMode, summary.text, isMobile]);

  const handleCreatePdf = (): void => {
    if (!protocolRef.current) return;
    void createProtocolPdf(protocolRef.current).then((pdf) => {
      pdf.save(`Council of Foods Meeting Summary #${meetingId}.pdf`);
    });
  };

  // Web: flex-fill column — scroll area grows, download row sticks to bottom.
  // Museum: position:fixed full-viewport (unchanged).
  const summaryWrapper: React.CSSProperties = isButtonSummaryMode
    ? {
      height: "100%",
      overflowY: "auto",
      mask: "linear-gradient(to bottom, rgb(0, 0, 0) 0, rgb(0,0,0) 93%, rgba(0,0,0, 0) 100% ) repeat-x",
    }
    : {
      flex: 1,
      minHeight: 0,
      overflowY: "auto",
      mask: "linear-gradient(to bottom, rgb(0, 0, 0) 0, rgb(0,0,0) 93%, rgba(0,0,0, 0) 100% ) repeat-x",
    };

  const wrapper: React.CSSProperties = isButtonSummaryMode
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
      // Fills the OverlayWrapper middle column (which is flex-stretched when
      // fillHeight is true). Scroll area grows via flex:1, download row is pinned
      // at the bottom. Small top margin matches the OverlayWrapper's top inset.
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      marginTop: isMobile ? "10px" : "20px",
      width: isMobile ? "600px" : "800px",
    };

  const buttonsWrapper: React.CSSProperties = {
    flexShrink: 0,
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

  const teleprompterContentStyle: React.CSSProperties = isButtonSummaryMode
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
          className={isButtonSummaryMode ? "scroll scroll--hide-scrollbar" : "scroll"}
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
        <ProtocolDocument ref={protocolRef} summaryText={summary.text} meetingId={meetingId} />
      </div>}
    </>
  );
}

export default Summary;
