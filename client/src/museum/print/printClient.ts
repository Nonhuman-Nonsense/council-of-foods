import { getButtonBridgeWsUrl } from "@/museum/button/buttonBridge";
import { log } from "@/logger";

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
  const url = `${getBridgeHttpBase()}/v1/print?meetingId=${meetingId}`;
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
        log.event("PRINT", `protocol ${outcome}`, { meetingId, attempt });
        return outcome;
      }
      if (response.status < 500) {
        // The bridge judged the job itself bad; sending it again changes nothing.
        log.event("PRINT", "protocol rejected by bridge", { meetingId, status: response.status });
        return "rejected";
      }
      failure = `HTTP ${response.status}`;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }

    const delay = Math.min(retry.retryBaseMs * 2 ** (attempt - 1), retry.retryMaxMs);
    if (Date.now() + delay > deadline) {
      log.event("PRINT", "gave up sending protocol to bridge", { meetingId, attempt, failure });
      return "gave_up";
    }
    log.event("PRINT", "bridge unreachable, retrying", { meetingId, attempt, failure, delay });
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
