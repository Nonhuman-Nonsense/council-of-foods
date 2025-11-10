import { useRef } from "react";
import { useMobile, dvh } from "../../utils";
import parse from 'html-react-parser';
import { marked } from "marked";
import { jsPDF } from "jspdf";
import { forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from "react-i18next";

function Summary({ summary, meetingId }) {
  const isMobile = useMobile();
  const pdfElementRef = useRef(null);

  const { t } = useTranslation();

  const summaryWrapper = {
    height: isMobile ?
      'calc(100% - 30px)'
      : 'calc(100% - 40px)',
    overflowY: "auto",
    mask: "linear-gradient(to bottom, rgb(0, 0, 0) 0, rgb(0,0,0) 93%, rgba(0,0,0, 0) 100% ) repeat-x",
  };

  const wrapper = {
    height: isMobile
      ? `calc(100${dvh} - 45px - 10px)`
      : `calc(100${dvh} - 60px - 56px - 20px)`,
    minHeight: "255px",
    marginBottom: isMobile ? "45px" : "56px",
    marginTop: isMobile ? "10px" : "20px",
    width: isMobile ? "600px" : "800px"
  };

  const buttonsWrapper = {
    height: isMobile ? "30px" : "40px",
    display: 'flex',
    flexDirection: 'row',
    alignItems: "center",
    justifyContent: "center"
  };

  const protocolStyle = {
    textAlign: "left",
    whiteSpace: "pre-wrap",
  };

  return (
    <>
      <div style={wrapper}>
        <div
          style={summaryWrapper}
          className="scroll"
        >
          <h2>{t('council').toUpperCase()}</h2>
          <h3>{t('meeting')} #{meetingId}</h3>
          <div
            id="protocol-container"
            style={protocolStyle}
          >
            {parse(marked(summary.text))}
            <hr /><br />
            <Disclaimer />
          </div>
        </div>
        <div style={buttonsWrapper}>
          <button onClick={() => pdfElementRef.current.createPdf()}>{t('summary.download')}</button>
        </div>
      </div>
      <PDFToPrint ref={pdfElementRef} summary={summary} meetingId={meetingId} />
    </>
  );
}

const PDFToPrint = forwardRef((props, ref) => {

  const protocolRef = useRef(null);

  const { t } = useTranslation();

  useImperativeHandle(ref, () => ({
    createPdf() {
      import("../../Tinos.js").then(() => {
        const pdf = new jsPDF("p", "pt", "a4");
        pdf.setFont("Tinos");
        pdf.html(protocolRef.current, {
          callback: function (doc) {
            pdf.save(`Council of Forest Meeting Summary #${props.meetingId}.pdf`);
          },
          autoPaging: 'text',
          margin: [50, 50, 50, 50]
        });
      });
    }
  }));

  return (
    <div style={{
      position: 'absolute',
      top: '0',
      display: 'none'//disable this for debug

    }}>
      <div ref={protocolRef} style={{
        position: 'absolute',
        top: '0',
        left: 0,
        backgroundColor: 'white',
        color: 'black',
        textAlign: 'left',
        fontFamily: '"Tinos", sans-serif',
        fontStyle: 'normal',
        overflow: 'hidden', //not sure why this is needed but fixes things
        width: "480px"
      }}>
        <div style={{ width: "100%" }}>
          <hr />
          <div style={{ height: "52px", position: 'relative' }}>
            <img style={{ width: '70px' }} src='/logos/council_logo.png' alt="council of forest logo" />
            <h2 style={{ fontSize: '24px', margin: '0', position: 'absolute', left: "80px", top: '2px' }}>{t('council').toUpperCase()}</h2>
            <h3 style={{ fontSize: '15px', margin: '0', position: 'absolute', left: "80px", top: "28px" }}>{t('meeting')} #{props.meetingId}</h3>
          </div>
          <hr />
          <div id="printed-style">
            {parse(marked(props.summary.text))}
            <hr /><br />
            <Disclaimer />
          </div>
        </div>
      </div>
    </div>
  );
});

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
    </div>
  );
}

export default Summary;
