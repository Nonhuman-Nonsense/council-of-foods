import React, { useRef } from "react";
import { useMobile } from "../../utils";
import parse from 'html-react-parser';
import { marked } from "marked";
import { jsPDF } from "jspdf";
import { forwardRef, useImperativeHandle } from 'react';

function Summary({ summary, meetingId }) {
  const isMobile = useMobile();
  const pdfElementRef = useRef(null);

  const summaryWrapper = {
    height: 'calc(100% - 40px)',
    overflowY: "auto",
  };

  const wrapper = {
    height: isMobile
      ? "calc(100vh - 55px)"
      : "calc(100vh - 60px - 56px - 20px)",
    marginBottom: isMobile ? "45px" : "56px",
    marginTop: !isMobile && "20px",
    width: isMobile ? "600px" : "800px"
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
      <h2>COUNCIL OF FOODS</h2>
      <h3>Meeting #{meetingId}</h3>
      <div
        id="protocol-container"
        style={protocolStyle}
      >
      {parse(marked(summary.text))}
      </div>
    </div>
      <div style={{height: "40px", display: 'flex', flexDirection: 'row', alignItems: "center", justifyContent: "center"}}>
      <button onClick={() => pdfElementRef.current.createPdf()}>
        Download PDF
        </button>
      </div>
    </div>
    <PDFToPrint ref={pdfElementRef} summary={summary} meetingId={meetingId} />
    </>
  );
}

const PDFToPrint = forwardRef((props, ref) => {

  const protocolRef = useRef(null);

  useImperativeHandle(ref, () => ({
    createPdf() {
      const pdf = new jsPDF("p", "pt", "a4");
      pdf.html(protocolRef.current, {
        callback: function (doc) {
          pdf.save(`Council of Foods Meeting Summary #${props.meetingId}.pdf`);
        },
        autoPaging: 'text',
        margin: [50, 50, 50, 50]
      });
    }
  }));

  return (
    <div style={{position: 'absolute',
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
        width:"480px"}}>
      <div style={{width: "100%"}}>
      <hr/>
      <div style={{height: "52px", position: 'relative'}}>
      <img style={{width: '70px'}} src='/logos/council_logo.png' alt="council of foods logo" />
      <h2 style={{fontSize: '24px', margin: '0', position: 'absolute', left: "80px", top: '2px'}}>COUNCIL OF FOODS</h2>
      <h3 style={{fontSize: '15px', margin: '0', position: 'absolute', left: "80px", top: "28px"}}>Meeting #{props.meetingId}</h3>
      </div>
      <hr />
      <div id="printed-style">
        {parse(marked(props.summary.text))}
        </div>
      </div>
    </div>
    </div>
  );
});

export default Summary;
