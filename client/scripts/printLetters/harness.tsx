/**
 * The page render.mts opens: lays out one letter or reply at a time exactly as SummaryPrintJob and
 * LetterReplyPrinter print them (LetterDocument, the app's stylesheet, createProtocolPdf with the
 * magnet mark) and hands the PDF back as base64. Never part of the app's build.
 */
import type React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import i18n from "@/i18n";
import "@/App.css";
import type { LetterView, PrintableLetterReply } from "@shared/ModelTypes";
import LetterDocument, { letterFields, replyFields } from "@council/protocol/LetterDocument";
import { createProtocolPdf } from "@council/protocol/protocolPdf";
import { letterBody } from "@council/protocol/summaryDocument";

export interface PrintLetter {
  meetingId: number;
  language: string;
  letter: LetterView;
}

declare global {
  interface Window {
    letterPdf: (item: PrintLetter, siteUrl: string) => Promise<{ base64: string; pages: number }>;
    replyPdf: (reply: PrintableLetterReply, siteUrl: string) => Promise<{ base64: string; pages: number }>;
  }
}

const meetingUrl = (siteUrl: string, language: string, meetingId: number) =>
  `${siteUrl.replace(/\/+$/, "")}/${language}/meeting/${meetingId}`;

/** Lays out one document hidden, as the print jobs do, and returns its PDF. */
async function renderPdf(language: string, document_: (ref: (node: HTMLDivElement | null) => void) => React.ReactElement) {
  await i18n.changeLanguage(language);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let element: HTMLDivElement | null = null;
  // One document at a time, laid out before the PDF reads it: a script, not the app.
  // eslint-disable-next-line @eslint-react/dom-no-flush-sync
  flushSync(() => {
    root.render(
      <div style={{ position: "absolute", top: "0", display: "none" }}>
        {document_((node) => { element = node; })}
      </div>,
    );
  });
  // The QR code draws in an effect, after the commit.
  await new Promise((resolve) => setTimeout(resolve, 50));
  try {
    const pdf = await createProtocolPdf(element!, { magnetMark: true });
    return { base64: pdf.output("datauristring").split(",")[1], pages: pdf.getNumberOfPages() };
  } finally {
    root.unmount();
    host.remove();
  }
}

/** A letter as SummaryPrintJob prints it. */
window.letterPdf = ({ meetingId, language, letter }, siteUrl) => {
  const t = i18n.getFixedT(language);
  return renderPdf(language, (ref) => (
    <LetterDocument
      ref={ref}
      groups={letterFields(letter, t, language)}
      body={letterBody(letter, t, false)}
      meetingId={meetingId}
      qrUrl={meetingUrl(siteUrl, language, meetingId)}
    />
  ));
};

/** A reply as LetterReplyPrinter prints it. */
window.replyPdf = (reply, siteUrl) => {
  const { language } = reply.letter;
  const t = i18n.getFixedT(language);
  const optOut = reply.kind === "opt-out" ? `\n\n*${t("letterReply.optOut", { name: reply.letter.recipientName })}*` : "";
  return renderPdf(language, (ref) => (
    <LetterDocument
      ref={ref}
      title="REPLY"
      groups={replyFields(reply, t)}
      body={reply.message + optOut}
      meetingId={reply.meetingId}
      qrUrl={meetingUrl(siteUrl, language, reply.meetingId)}
    />
  ));
};
