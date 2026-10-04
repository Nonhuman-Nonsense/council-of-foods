import React, { useEffect, useRef, useState } from "react";
import type { PrintableLetterReply } from "@shared/ModelTypes";
import { useRouting } from "@/navigation";
import { log } from "@/logger";
import ReplyDocument from "@council/protocol/ReplyDocument";
import { createProtocolPdf } from "@council/protocol/protocolPdf";
import { fetchRepliesToPrint, markReplyPrinted, sendReplyToPrinter } from "./printClient";

/** How often the installation asks for new replies to print. */
export const REPLY_POLL_MS = 60_000;

/**
 * Prints the replies to this venue's letters as they come in (docs/council-letters.md →
 * Receiving), whatever the screen shows. One at a time: render it hidden, lay out the PDF,
 * hand it to the bridge, and tell the server it is printed. A reply the bridge refused is not
 * tried again until the page reloads, so a bad one never loops; the bridge prints each at most
 * once, so asking again after a reload is safe.
 */
function LetterReplyPrinter(): React.ReactElement | null {
  const { meetingPath } = useRouting();
  const [current, setCurrent] = useState<PrintableLetterReply | null>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const given = useRef(new Set<string>());

  useEffect(() => {
    if (current) return;
    let stopped = false;
    const poll = async () => {
      const next = (await fetchRepliesToPrint()).find((reply) => !given.current.has(reply.id));
      if (!stopped && next) setCurrent(next);
    };
    void poll();
    const timer = window.setInterval(() => void poll(), REPLY_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [current]);

  useEffect(() => {
    const element = documentRef.current;
    if (!current || !element) return;
    given.current.add(current.id);
    void (async () => {
      try {
        const pdf = (await createProtocolPdf(element)).output("blob");
        const outcome = await sendReplyToPrinter(current.id, pdf);
        if (outcome === "queued" || outcome === "duplicate") await markReplyPrinted(current.id);
        else log.event("PRINT", "reply not printed", { replyId: current.id, outcome });
      } catch (error) {
        log.event("PRINT", "could not create reply PDF", {
          replyId: current.id,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setCurrent(null);
      }
    })();
  }, [current]);

  if (!current) return null;
  return (
    <div style={{ position: "absolute", top: "0", display: "none" }} data-testid="letter-reply-print-job">
      <ReplyDocument
        ref={documentRef}
        reply={current}
        meetingUrl={new URL(meetingPath(current.meetingId), window.location.origin).toString()}
      />
    </div>
  );
}

export default LetterReplyPrinter;
