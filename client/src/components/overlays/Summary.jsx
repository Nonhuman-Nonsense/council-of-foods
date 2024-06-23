import React, { useEffect } from "react";
import { useMobile } from "../../utils";
import useCreatePdf from "../../hooks/useCreatePdf";

function Summary({ summary, meetingId }) {
  const isMobile = useMobile();
  const { createPdf, createHtmlFromMarkup } = useCreatePdf();

  useEffect(() => {
    const protocolContainer = document.getElementById("protocol-container");

    protocolContainer.innerHTML = createHtmlFromMarkup(summary.text);
  }, []);

  const wrapper = {
    height: isMobile
      ? "calc(100vh - 55px)"
      : "calc(100vh - 60px - 56px - 20px)",
    marginBottom: isMobile ? "45px" : "56px",
    marginTop: !isMobile && "20px",
    width: "600px",
    overflowY: "auto",
  };

  const protocol = {
    textAlign: "left",
    whiteSpace: "pre-wrap",
  };

  return (
    <div
      style={wrapper}
      className="scroll"
    >
      <h2>COUNCIL OF FOODS</h2>
      <button onClick={() => createPdf(summary.text, meetingId)}>
        Download PDF
      </button>
      <h3>Meeting #{meetingId}</h3>
      <div
        id="protocol-container"
        style={protocol}
      ></div>
    </div>
  );
}

export default Summary;
