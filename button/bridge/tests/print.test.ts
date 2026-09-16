import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startTestBridge, waitForCondition, type TestBridge } from "./testHarness.js";

const PDF = Buffer.from("%PDF-1.4\n% council protocol\n%%EOF\n");
const FOODS = "https://council-of-foods.com";

function postPdf(
  bridge: TestBridge,
  meetingId: string,
  { body = PDF, origin }: { body?: Buffer; origin?: string } = {},
): Promise<Response> {
  return fetch(`${bridge.printUrl}?meetingId=${meetingId}`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf", ...(origin ? { Origin: origin } : {}) },
    body,
  });
}

function setPrinterMode(bridge: TestBridge, mode: "ok" | "fail"): Promise<Response> {
  return fetch(bridge.printUrl.replace("/v1/print", "/v1/test/printer"), {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
}

async function spoolFiles(bridge: TestBridge, folder: "pending" | "done"): Promise<string[]> {
  return (await readdir(path.join(bridge.spoolDir!, folder))).sort();
}

function printed(bridge: TestBridge): string[] {
  return bridge.printer!.getPrinted().sort();
}

async function waitForPrinted(bridge: TestBridge, count: number): Promise<void> {
  await waitForCondition(() => printed(bridge).length >= count, 5000, 10);
}

const settle = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));

describe("bridge printing", () => {
  let bridge: TestBridge;

  beforeEach(async () => {
    bridge = await startTestBridge({ print: true });
  });

  afterEach(async () => {
    await bridge.stop();
  });

  it("prints a posted PDF and files it under done/", async () => {
    const response = await postPdf(bridge, "42", { origin: FOODS });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, status: "queued" });
    await waitForPrinted(bridge, 1);
    expect(printed(bridge)).toEqual(["council-of-foods.com_42.pdf"]);
    await expect.poll(() => spoolFiles(bridge, "done")).toEqual(["council-of-foods.com_42.pdf"]);
    expect(await spoolFiles(bridge, "pending")).toEqual([]);
  });

  it("prints a meeting once however often it is posted, across restarts", async () => {
    const concurrent = await Promise.all([
      postPdf(bridge, "7", { origin: FOODS }),
      postPdf(bridge, "7", { origin: FOODS }),
    ]);
    expect(concurrent.map((r) => r.status).sort()).toEqual([200, 202]);
    await waitForPrinted(bridge, 1);

    const later = await postPdf(bridge, "7", { origin: FOODS });
    expect(await later.json()).toEqual({ ok: true, status: "duplicate" });

    await bridge.restart();
    expect((await postPdf(bridge, "7", { origin: FOODS })).status).toBe(200);
    await settle();
    expect(printed(bridge)).toEqual(["council-of-foods.com_7.pdf"]);
  });

  it("keeps the same meeting id from different sites apart", async () => {
    await postPdf(bridge, "5", { origin: FOODS });
    await postPdf(bridge, "5", { origin: "https://staging.council-of-foods.com" });

    await waitForPrinted(bridge, 2);
    expect(printed(bridge)).toEqual([
      "council-of-foods.com_5.pdf",
      "staging.council-of-foods.com_5.pdf",
    ]);
  });

  it("keeps retrying a refused job and prints it once the printer is back", async () => {
    expect((await setPrinterMode(bridge, "fail")).status).toBe(200);
    expect((await postPdf(bridge, "9")).status).toBe(202);

    // Several backoff rounds go by without the job being lost or printed.
    await settle(250);
    expect(await spoolFiles(bridge, "pending")).toEqual(["local_9.pdf"]);
    const health = await (await fetch(bridge.healthUrl)).json();
    expect(health.print).toMatchObject({ enabled: true, pending: 1 });
    expect(health.print.lastError).toContain("failing");

    await setPrinterMode(bridge, "ok");
    await waitForPrinted(bridge, 1);
    await expect.poll(() => spoolFiles(bridge, "pending")).toEqual([]);
    await expect
      .poll(async () => (await (await fetch(bridge.healthUrl)).json()).print)
      .toMatchObject({ pending: 0, lastError: null, printer: { state: "idle" } });
  });

  it("prints whatever is waiting in pending/ when it starts", async () => {
    await writeFile(path.join(bridge.spoolDir!, "pending", "council-of-foods.com_3.pdf"), PDF);

    await bridge.restart();

    await waitForPrinted(bridge, 1);
    expect(printed(bridge)).toEqual(["council-of-foods.com_3.pdf"]);
  });

  it.each([
    { name: "a body that is not a PDF", meetingId: "1", body: Buffer.from("hello"), status: 400 },
    { name: "a non-numeric meeting id", meetingId: "abc", body: PDF, status: 400 },
    { name: "a PDF over the size cap", meetingId: "1", body: Buffer.concat([PDF, Buffer.alloc(1024 * 1024)]), status: 413 },
    { name: "a disallowed origin", meetingId: "1", body: PDF, origin: "https://evil.example", status: 403 },
  ])("rejects $name without queueing anything", async ({ meetingId, body, origin, status }) => {
    const response = await postPdf(bridge, meetingId, { body, origin });

    expect(response.status).toBe(status);
    await settle(50);
    expect(await spoolFiles(bridge, "pending")).toEqual([]);
    expect(printed(bridge)).toEqual([]);
  });

  it("answers the browser preflight for an allowed origin", async () => {
    const response = await fetch(`${bridge.printUrl}?meetingId=1`, {
      method: "OPTIONS",
      headers: { Origin: FOODS, "Access-Control-Request-Method": "POST" },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(FOODS);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});

describe("bridge without printing", () => {
  it("reports printing as disabled and refuses jobs", async () => {
    const bridge = await startTestBridge();
    try {
      const health = await (await fetch(bridge.healthUrl)).json();
      expect(health.print).toEqual({ enabled: false });
      expect((await postPdf(bridge, "1")).status).toBe(503);
    } finally {
      await bridge.stop();
    }
  });
});
