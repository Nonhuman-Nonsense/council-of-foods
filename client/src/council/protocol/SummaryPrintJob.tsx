import React, { useEffect, useRef } from "react";
import type { Message } from "@shared/ModelTypes";
import ProtocolDocument from "./ProtocolDocument";
import { createProtocolPdf } from "./protocolPdf";
import { printProtocolOnce } from "@/museum/print/printClient";

interface SummaryPrintJobProps {
  meetingId: number;
  textMessages: Message[];
}

/**
 * Prints the meeting's protocol as soon as the server delivers the summary —
 * not when playback reaches it, so the paper is on its way while the council
 * is still reading. Mount only for a live meeting that should print; renders
 * nothing visible.
 */
function SummaryPrintJob({ meetingId, textMessages }: SummaryPrintJobProps): React.ReactElement | null {
  const protocolRef = useRef<HTMLDivElement>(null);
  const summary = textMessages.find((message) => message.type === "summary");
  const summaryText = summary && "text" in summary ? summary.text : null;

  useEffect(() => {
    const element = protocolRef.current;
    if (!summaryText || !element) return;
    void printProtocolOnce(meetingId, async () =>
      (await createProtocolPdf(element)).output("blob"),
    );
  }, [meetingId, summaryText]);

  if (!summaryText) return null;

  return (
    <div style={{ position: 'absolute', top: '0', display: 'none' }} data-testid="summary-print-job">
      <ProtocolDocument ref={protocolRef} summaryText={summaryText} meetingId={meetingId} />
    </div>
  );
}

export default SummaryPrintJob;
