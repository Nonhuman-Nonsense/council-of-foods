import { getButtonBridgeWsUrl } from "@/museum/button/buttonBridge";
import { log } from "@/logger";
import type { PrintableLetterReply } from "@shared/ModelTypes";

/**
 * Sends meeting protocols to the local bridge, which spools and prints them.
 *
 * Plain module state, not a hook: a send that is retrying must outlive the
 * council screen, which the museum leaves for the landing page on its own.
 * The bridge prints a meeting at most once, so retrying (and a resumed meeting
 * sending again after a reload) is always safe.
 */

export type PrintOutcome = "queued" | "duplicate" | "rejected" | "gave_up";

export type PrintRetryOptions = {
  retryBaseMs: number;
  retryMaxMs: number;
  /** Stop retrying an unreachable bridge after this long. */
  giveUpAfterMs: number;
};

const DEFAULT_RETRY: PrintRetryOptions = {
  retryBaseMs: 1_000,
  retryMaxMs: 30_000,
  giveUpAfterMs: 10 * 60_000,
};

const REQUEST_TIMEOUT_MS = 15_000;

/** HTTP origin of the bridge, derived from the button socket URL so one override moves both. */
export function getBridgeHttpBase(): string {
  const url = new URL(getButtonBridgeWsUrl());
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  return url.origin;
}

export async function sendProtocolToPrinter(
  meetingId: number,
  pdf: Blob,
  retry: PrintRetryOptions = DEFAULT_RETRY,
): Promise<PrintOutcome> {
  return sendPdfToBridge(`meetingId=${meetingId}`, { meetingId }, pdf, retry);
}

/** A reply to one of the letters: printed once, under a key of its own (see the bridge). */
export async function sendReplyToPrinter(
  replyId: string,
  pdf: Blob,
  retry: PrintRetryOptions = DEFAULT_RETRY,
): Promise<PrintOutcome> {
  return sendPdfToBridge(`replyId=${encodeURIComponent(replyId)}`, { replyId }, pdf, retry);
}

async function sendPdfToBridge(
  query: string,
  context: Record<string, unknown>,
  pdf: Blob,
  retry: PrintRetryOptions,
): Promise<PrintOutcome> {
  const url = `${getBridgeHttpBase()}/v1/print?${query}`;
  const deadline = Date.now() + retry.giveUpAfterMs;

  for (let attempt = 1; ; attempt += 1) {
    let failure: string;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: pdf,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status === 202 || response.status === 200) {
        const outcome = response.status === 202 ? "queued" : "duplicate";
        log.event("PRINT", `print job ${outcome}`, { ...context, attempt });
        return outcome;
      }
      if (response.status < 500) {
        // The bridge judged the job itself bad; sending it again changes nothing.
        log.event("PRINT", "print job rejected by bridge", { ...context, status: response.status });
        return "rejected";
      }
      failure = `HTTP ${response.status}`;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }

    const delay = Math.min(retry.retryBaseMs * 2 ** (attempt - 1), retry.retryMaxMs);
    if (Date.now() + delay > deadline) {
      log.event("PRINT", "gave up sending print job to bridge", { ...context, attempt, failure });
      return "gave_up";
    }
    log.event("PRINT", "bridge unreachable, retrying", { ...context, attempt, failure, delay });
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export type TestPageOutcome = "queued" | "rejected" | "unreachable";

/** One attempt, no retries: staff are watching and can press again. */
export async function sendTestPage(pdf: Blob): Promise<TestPageOutcome> {
  try {
    const response = await fetch(`${getBridgeHttpBase()}/v1/print?test=1`, {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: pdf,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const outcome = response.status === 202 ? "queued" : "rejected";
    log.event("PRINT", `test page ${outcome}`, { status: response.status });
    return outcome;
  } catch (error) {
    log.event("PRINT", "test page: bridge unreachable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "unreachable";
  }
}

/**
 * Replies to the venue's letters still to print, from the bridge (which asks the council server
 * with the installation key). Empty when the bridge cannot say — the next poll asks again.
 */
export async function fetchRepliesToPrint(): Promise<PrintableLetterReply[]> {
  try {
    const response = await fetch(`${getBridgeHttpBase()}/v1/installation/letter-replies`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return [];
    return ((await response.json()) as { replies?: PrintableLetterReply[] }).replies ?? [];
  } catch {
    return [];
  }
}

/** Tells the council server, through the bridge, that a reply is printed. */
export async function markReplyPrinted(replyId: string): Promise<boolean> {
  try {
    const response = await fetch(`${getBridgeHttpBase()}/v1/installation/letter-replies/printed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: replyId }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

const attempted = new Set<number>();

/**
 * Prints a meeting's protocol once per page load. `createPdf` is only called
 * for the first request, so a summary that re-renders does not lay out the
 * PDF again.
 */
export function printProtocolOnce(
  meetingId: number,
  createPdf: () => Promise<Blob>,
  retry?: PrintRetryOptions,
): Promise<PrintOutcome> | null {
  if (attempted.has(meetingId)) return null;
  attempted.add(meetingId);
  return createPdf().then(
    (pdf) => sendProtocolToPrinter(meetingId, pdf, retry),
    (error: unknown) => {
      log.event("PRINT", "could not create protocol PDF", {
        meetingId,
        error: error instanceof Error ? error.message : String(error),
      });
      return "rejected" as const;
    },
  );
}

/** Test hook: forget which meetings were printed. */
export function _resetPrintedMeetingsForTests(): void {
  attempted.clear();
}
