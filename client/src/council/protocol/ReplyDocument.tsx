import React from "react";
import parse from "html-react-parser";
import { marked } from "marked";
import { useTranslation } from "react-i18next";
import { QRCodeCanvas } from "qrcode.react";
import type { PrintableLetterReply } from "@shared/ModelTypes";
import councilLogo from "@assets/logos/council_logo.png";

interface ReplyDocumentProps {
  reply: PrintableLetterReply;
  /** The meeting whose letter it answers, for the QR code. */
  meetingUrl: string;
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * A reply to one of the letters as it appears on paper, in the same frame as the protocol and
 * the letter ({@link ProtocolDocument}): who wrote back, to which being's letter, and what they
 * wrote. Never shown on screen — render it hidden and pass the element to the PDF renderer.
 */
function ReplyDocument({ reply, meetingUrl, ref }: ReplyDocumentProps): React.ReactElement {
  // In the letter's language, whatever the installation's screen is showing.
  const { i18n } = useTranslation();
  const tr = i18n.getFixedT(reply.letter.language);
  const received = new Date(reply.receivedAt).toLocaleDateString(reply.letter.language === "sv" ? "sv-SE" : "en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div ref={ref} style={{
      position: "absolute",
      top: "0",
      left: 0,
      backgroundColor: "white",
      color: "black",
      textAlign: "left",
      fontFamily: '"Tinos", sans-serif',
      overflow: "hidden",
      width: "480px",
    }}>
      <hr />
      <div style={{ height: "52px", position: "relative" }}>
        <img style={{ width: "70px" }} src={councilLogo} alt="" />
        <h2 style={{ fontSize: "24px", margin: "0", position: "absolute", left: "80px", top: "2px" }}>{tr("app.council").toUpperCase()}</h2>
        <h3 style={{ fontSize: "15px", margin: "0", position: "absolute", left: "80px", top: "28px" }}>
          {tr("letterReply.heading", { name: reply.letter.authorName, meetingId: reply.meetingId })}
        </h3>
        <QRCodeCanvas value={meetingUrl} style={{ position: "absolute", right: "10px", top: "2.5px", width: "45px", height: "45px" }} />
      </div>
      <hr />
      <div id="printed-style">
        <p>
          <b>{tr("letter.from")}:</b> {reply.fromName ? `${reply.fromName}, ${reply.letter.recipientName}` : reply.letter.recipientName}<br />
          <b>{tr("letter.to")}:</b> {reply.letter.authorName}<br />
          <b>{tr("letter.subject")}:</b> {reply.subject || reply.letter.subject}<br />
          {received}
        </p>
        {parse(marked.parse(reply.message, { async: false }) as string)}
        {reply.kind === "opt-out" && <p><i>{tr("letterReply.optOut", { name: reply.letter.recipientName })}</i></p>}
        <hr />
      </div>
    </div>
  );
}

export default ReplyDocument;
