import React from "react";
import parse from 'html-react-parser';
import { marked } from "marked";
import { useTranslation } from "react-i18next";
import { QRCodeCanvas } from 'qrcode.react';
import councilLogo from "@assets/logos/council_logo.png";
import Disclaimer from "./Disclaimer";

interface ProtocolDocumentProps {
  summaryText: string;
  meetingId: string | number | null;
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * The meeting protocol as it appears on paper: black on white, sized for
 * {@link createProtocolPdf}. Never shown on screen — render it inside a hidden
 * container and pass the element to the PDF renderer.
 */
function ProtocolDocument({ summaryText, meetingId, ref }: ProtocolDocumentProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <div ref={ref} style={{
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
          {parse(marked.parse(summaryText, { async: false }) as string)}
          <hr /><br />
          <Disclaimer />
        </div>
      </div>
    </div>
  );
}

export default ProtocolDocument;
