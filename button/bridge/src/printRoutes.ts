import type http from "node:http";
import { isAllowedOrigin } from "./cors.js";
import type { MockPrinter } from "./printer.js";
import { InvalidPrintJobError, type PrintSpool } from "./printSpool.js";
import { readJsonBody } from "./testApi.js";

export const PRINT_PATH = "/v1/print";
export const TEST_PRINTER_PATH = "/v1/test/printer";

export type PrintRuntime = {
  spool: PrintSpool;
  /** Set when the bridge runs the mock printer; enables the test endpoint. */
  mockPrinter: MockPrinter | null;
};

class BodyTooLargeError extends Error {}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  cors: Record<string, string>,
): void {
  res.writeHead(status, { "Content-Type": "application/json", ...cors });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      // Keep reading past the cap but drop the bytes, so the 413 still reaches the client.
      if (size <= maxBytes) chunks.push(chunk);
    });
    req.on("end", () => {
      if (size > maxBytes) reject(new BodyTooLargeError());
      else resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

/**
 * Job key: the page's host plus the meeting id. Staging and production number
 * meetings independently, and both can run on one install Mac.
 */
export function printJobKey(origin: string | undefined, meetingId: string): string {
  const host = origin ? new URL(origin).hostname : "local";
  return `${host}_${meetingId}`;
}

/**
 * `POST /v1/print?meetingId=<n>` with the PDF as the raw body.
 * 202 queued · 200 duplicate · 400 invalid · 403 origin · 413 too large · 503 printing off.
 */
export async function handlePrint(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  options: {
    print: PrintRuntime | null;
    maxBytes: number;
    cors: Record<string, string>;
  },
): Promise<void> {
  const { print, maxBytes } = options;
  const cors = { ...options.cors, "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;

  // Browsers always send an Origin on a cross-origin POST; only local tools and curl omit it.
  if (origin !== undefined && !isAllowedOrigin(origin)) {
    sendJson(res, 403, { ok: false, error: "origin not allowed" }, {});
    return;
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  if (!print) {
    sendJson(res, 503, { ok: false, error: "printing disabled" }, cors);
    return;
  }

  const meetingId = new URL(req.url ?? "", "http://bridge").searchParams.get("meetingId") ?? "";
  if (!/^\d{1,12}$/.test(meetingId)) {
    sendJson(res, 400, { ok: false, error: "expected numeric meetingId" }, cors);
    return;
  }

  try {
    const pdf = await readBody(req, maxBytes);
    const status = await print.spool.enqueue(printJobKey(origin, meetingId), pdf);
    sendJson(res, status === "queued" ? 202 : 200, { ok: true, status }, cors);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      sendJson(res, 413, { ok: false, error: "PDF too large" }, cors);
    } else if (error instanceof InvalidPrintJobError) {
      sendJson(res, 400, { ok: false, error: error.message }, cors);
    } else {
      console.error("[button-bridge/print] enqueue failed", error);
      sendJson(res, 500, { ok: false, error: "could not queue print job" }, cors);
    }
  }
}

/** Mock printer only: `POST /v1/test/printer {"mode":"ok"|"fail"}`. */
export async function handleTestPrinter(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  print: PrintRuntime | null,
  cors: Record<string, string>,
): Promise<void> {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { ...cors, "Access-Control-Allow-Methods": "POST, OPTIONS" });
    res.end();
    return;
  }
  const mockPrinter = print?.mockPrinter;
  if (!print || !mockPrinter) {
    sendJson(res, 503, { ok: false, error: "mock printer required" }, cors);
    return;
  }
  const body = (await readJsonBody(req).catch(() => ({}))) as { mode?: unknown };
  if (body.mode !== "ok" && body.mode !== "fail") {
    sendJson(res, 400, { ok: false, error: 'expected { mode: "ok" | "fail" }' }, cors);
    return;
  }
  mockPrinter.setMode(body.mode);
  print.spool.retryNow();
  sendJson(res, 200, { ok: true }, cors);
}
