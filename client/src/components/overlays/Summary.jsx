import { useRef } from "react";
import { useMobile, dvh } from "../../utils";
import parse from 'html-react-parser';
import { marked } from "marked";
import { jsPDF } from "jspdf";
import { forwardRef, useImperativeHandle } from 'react';

function Summary({ summary, meetingId }) {
  const isMobile = useMobile();
  const pdfElementRef = useRef(null);

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
      <h2>COUNCIL OF FOODS</h2>
      <h3>Meeting #{meetingId}</h3>
      <div
        id="protocol-container"
        style={protocolStyle}
      >
      {parse(marked(summary.text))}
      <hr/><br/>
      <Disclaimer />
      </div>
    </div>
      <div style={buttonsWrapper}>
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
      import("../../Tinos.js").then(() => {
        const pdf = new jsPDF("p", "pt", "a4");
        pdf.setFont("Tinos");
        pdf.html(protocolRef.current, {
          callback: function (doc) {
            pdf.save(`Council of Foods Meeting Summary #${props.meetingId}.pdf`);
          },
          autoPaging: 'text',
          margin: [50, 50, 50, 50]
        });
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
        fontFamily: '"Tinos", sans-serif',
        fontStyle: 'normal',
        overflow: 'hidden', //not sure why this is needed but fixes things
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
        <hr/><br/>
        <Disclaimer />
      </div>
      </div>
    </div>
    </div>
  );
});

function Disclaimer() {

  return (
      <div>
        <p>This document was created by the Council of Foods, a political arena where food speaks—not just of the broken food system, but of the expanding frontiers of biotechnology, through the use of artificial intelligence. While every effort has been made to generate meaningful content, please note the following:</p><br/>
        <ol>
          <li>This document may contain misinformation, outdated details, propaganda, or bad ideas.</li>
          <li>The discussions may provide useful insights and reflect diverse ethical positions but should not replace evidence-based research or deep contemplation.</li>
          <li>Don't just chat about it—get up and take action!</li>
        </ol><br/>
        <p>Council of Foods is an initiative by art & design collective <a href="https://nonhuman-nonsense.com/">Nonhuman Nonsense</a>, as part of the Hungry EcoCities project of the S+T+ARTS programme, and has received funding from the European Union's Horizon Europe research and innovation programme under <a href="https://cordis.europa.eu/project/id/101069990">grant agreement 101069990</a>.</p>
        <br/>
      </div>
  );
}

export default Summary;
