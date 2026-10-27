import React, { useEffect, useRef } from "react";
import type { Message } from "@shared/ModelTypes";
import ProtocolDocument from "./ProtocolDocument";
import LetterDocument, { letterFields } from "./LetterDocument";
import { createProtocolPdf } from "./protocolPdf";
import { printProtocolOnce } from "@/museum/print/printClient";
import { useTranslation } from "react-i18next";
import { isPrintableSummary, summaryDocument, summaryLetter } from "./summaryDocument";

/**
 * How long a letter waits before it goes to the printer, from when the server delivers it. The
 * chair's farewell plays first ("it is printed behind you"), and the printer should start about
 * then, not while the human is still looking at the screen. The PDF is laid out at once; only the
 * send waits, so leaving the meeting in the meantime does not stop the print.
 */
export const LETTER_PRINT_DELAY_MS = 20_000;

/** Not tied to the component: the print goes ahead after the meeting is left. */
function holdLetter(): Promise<void> {
  return new Promise((resolve) => { window.setTimeout(resolve, LETTER_PRINT_DELAY_MS); });
}

interface SummaryPrintJobProps {
  meetingId: number;
  textMessages: Message[];
}

/**
 * Prints the meeting's protocol as soon as the server delivers the summary, not when playback
 * reaches it, so the paper is on its way while the council is still reading — or its letter,
 * {@link LETTER_PRINT_DELAY_MS} later, while the chair's farewell and the credits play.
 * A letter is printed only if the human was there to answer when asked to add something, and
 * only the letter itself: no email footer, no disclaimer, and a mark for the magnets that hang it.
 * Mount only for a live meeting that should print; renders nothing visible.
 */
function SummaryPrintJob({ meetingId, textMessages }: SummaryPrintJobProps): React.ReactElement | null {
  const protocolRef = useRef<HTMLDivElement>(null);
  const { t, i18n } = useTranslation();
  const summary = textMessages.find((message) => message.type === "summary");
  const summaryText = isPrintableSummary(summary) ? summaryDocument(summary, t, { footer: false }) : null;
  const letter = summaryLetter(summary);

  useEffect(() => {
    const element = protocolRef.current;
    if (!summaryText || !element) return;
    void printProtocolOnce(meetingId, async () => {
      const pdf = (await createProtocolPdf(element, { magnetMark: letter !== null })).output("blob");
      if (letter) await holdLetter();
      return pdf;
    });
  }, [meetingId, summaryText, letter]);

  if (!summaryText) return null;

  return (
    <div style={{ position: 'absolute', top: '0', display: 'none' }} data-testid="summary-print-job">
      {letter ? (
        <LetterDocument
          ref={protocolRef}
          groups={letterFields(letter, t, i18n.language)}
          body={summaryText}
          meetingId={meetingId}
          qrUrl={window.location.href}
        />
      ) : (
        <ProtocolDocument ref={protocolRef} summaryText={summaryText} meetingId={meetingId} />
      )}
    </div>
  );
}

export default SummaryPrintJob;
