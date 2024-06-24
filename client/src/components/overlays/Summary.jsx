import React, { useEffect } from "react";
import { useMobile } from "../../utils";
import useCreatePdf from "../../hooks/useCreatePdf";
import parse from 'html-react-parser';

function Summary({ summary, meetingId }) {
  const isMobile = useMobile();
  const { createPdf, createHtmlFromMarkup } = useCreatePdf();

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
    width: "800px",
  };

  const protocol = {
    textAlign: "left",
    whiteSpace: "pre-wrap",
  };

  return (
    <div style={wrapper}>
    <div
      style={summaryWrapper}
      className="scroll"
    >
      <h2>COUNCIL OF FOODS</h2>
      <h3>Meeting #{meetingId}</h3>
      <div
        id="protocol-container"
        style={protocol}
      >
      {parse(createHtmlFromMarkup(summary.text))}
      </div>
    </div>
    <div style={{height: "40px", display: 'flex', flexDirection: 'row', alignItems: "center", justifyContent: "center"}}>
      <button onClick={() => createPdf(summary.text, meetingId)}>
        Download PDF
        </button>
        </div>
    </div>
  );
}

export default Summary;
