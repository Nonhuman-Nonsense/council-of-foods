import React, { useEffect, useRef } from "react";
import type { Message } from "@shared/ModelTypes";
import ProtocolDocument from "./ProtocolDocument";
import { createProtocolPdf } from "./protocolPdf";
import { printProtocolOnce } from "@/museum/print/printClient";
import { useTranslation } from "react-i18next";
import { isLetterSummary, isPrintableSummary, summaryDocument } from "./summaryDocument";

interface SummaryPrintJobProps {
  meetingId: number;
  textMessages: Message[];
}

/**
 * Prints the meeting's protocol — or its letter — as soon as the server delivers the summary,
 * not when playback reaches it, so the paper is on its way while the council is still reading.
 * A letter is printed only if the human was there to answer when asked to add something, and
 * only the letter itself: no email footer, no disclaimer, and a mark for the magnets that hang it.
 * Mount only for a live meeting that should print; renders nothing visible.
 */
function SummaryPrintJob({ meetingId, textMessages }: SummaryPrintJobProps): React.ReactElement | null {
  const protocolRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const summary = textMessages.find((message) => message.type === "summary");
  const summaryText = isPrintableSummary(summary) ? summaryDocument(summary, t, { footer: false }) : null;
  const letter = isLetterSummary(summary);

  useEffect(() => {
    const element = protocolRef.current;
    if (!summaryText || !element) return;
    void printProtocolOnce(meetingId, async () =>
      (await createProtocolPdf(element, { magnetMark: letter })).output("blob"),
    );
  }, [meetingId, summaryText, letter]);

  if (!summaryText) return null;

  return (
    <div style={{ position: 'absolute', top: '0', display: 'none' }} data-testid="summary-print-job">
      <ProtocolDocument ref={protocolRef} summaryText={summaryText} meetingId={meetingId} disclaimer={!letter} />
    </div>
  );
}

export default SummaryPrintJob;
