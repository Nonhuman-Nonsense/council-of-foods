import React, { useRef } from "react";
import { useMobile, dvh } from "@/utils";
import parse from 'html-react-parser';
import { marked } from "marked";
import { jsPDF } from "jspdf";
import { useTranslation } from "react-i18next";
import { QRCodeCanvas } from 'qrcode.react';
import councilLogoWhite from "@assets/logos/council_logo_white.svg";
import councilLogo from "@assets/logos/council_logo.png";

export interface SummaryData {
  text: string;
}

interface SummaryProps {
  summary: SummaryData;
  meetingId: string | number | null;
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
function Summary({ summary, meetingId }: SummaryProps): React.ReactElement {
  const isMobile = useMobile();
  const protocolRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  const handleCreatePdf = (): void => {
    import("../../Tinos.js").then(() => {
      const pdf = new jsPDF("p", "pt", "a4");
      pdf.setFont("Tinos");
      if (protocolRef.current) {
        pdf.html(protocolRef.current, {
          callback: function (doc: jsPDF) {
            pdf.save(`Council of Foods Meeting Summary #${meetingId}.pdf`);
          },
          autoPaging: 'text',
          margin: [50, 50, 50, 50]
        });
      }
    });
  };

  const summaryWrapper: React.CSSProperties = {
    height: isMobile ?
      'calc(100% - 30px)'
      : 'calc(100% - 40px)',
    overflowY: "auto",
    mask: "linear-gradient(to bottom, rgb(0, 0, 0) 0, rgb(0,0,0) 93%, rgba(0,0,0, 0) 100% ) repeat-x",
  };

  const wrapper: React.CSSProperties = {
    height: isMobile
      ? `calc(100${dvh} - 45px - 10px)`
      : `calc(100${dvh} - 60px - 56px - 20px)`,
    minHeight: "255px",
    marginBottom: isMobile ? "45px" : "56px",
    marginTop: isMobile ? "10px" : "20px",
    width: isMobile ? "600px" : "800px"
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

  return (
    <>
      <div style={wrapper}>
        <div style={summaryWrapper} className="scroll">
          <hr />
          <div style={{ display: "flex", flexDirection: "row", margin: "20px 0", justifyContent: "space-between" }}>
            <div>
              <img style={{ width: isMobile ? '80px' : '110px', paddingRight: "10px" }} src={councilLogoWhite} alt="council of foods logo" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", textAlign: "left", flex: "1", paddingLeft: "15px" }}>
              <h2 style={{ margin: 0 }}>{t('council').toUpperCase()}</h2>
              <h3 style={{ margin: 0 }}>{t('meeting')} #{meetingId}</h3>
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
        <div style={buttonsWrapper}>
          <button onClick={handleCreatePdf}>{t('summary.download')}</button>
        </div>
      </div>

      {/* Hidden PDF Template */}
      <div style={{ position: 'absolute', top: '0', display: 'none' }}>
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
              <h2 style={{ fontSize: '24px', margin: '0', position: 'absolute', left: "80px", top: '2px' }}>{t('council').toUpperCase()}</h2>
              <h3 style={{ fontSize: '15px', margin: '0', position: 'absolute', left: "80px", top: "28px" }}>{t('meeting')} #{meetingId}</h3>
              <QRCodeCanvas value={window.location.href} style={{ position: 'absolute', right: "10px", top: "2.5px", width: "45px", height: "45px" }} />
            </div >
            <hr />
            <div id="printed-style">
              {/* Ensure synchronous parsing for type safety */}
              {parse(marked.parse(summary.text, { async: false }) as string)}
              <hr /><br />
              <Disclaimer />
            </div>
          </div >
        </div >
      </div >
    </>
  );
}


function Disclaimer() {

  const { t } = useTranslation();

  return (
    <div>
      <p>{t('disclaimer.1')}</p><br />
      <ol>
        <li>{t('disclaimer.2')}</li>
        <li>{t('disclaimer.3')}</li>
        <li>{t('disclaimer.4')}</li>
      </ol><br />
      <p>{t('disclaimer.5')} <a href="https://nonhuman-nonsense.com/">Nonhuman&nbsp;Nonsense</a>, {t('disclaimer.6')} (<a href="https://www.vinnova.se/en/p/council-of-the-forest">ref. nr. 2025-00344</a>).</p>
      <br />
      <p>{t('disclaimer.7')}</p>
      <br />
    </div >
  );
}

export default Summary;
