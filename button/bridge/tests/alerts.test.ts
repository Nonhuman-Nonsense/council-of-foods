import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startTestBridge, waitForCondition, type TestBridge } from "./testHarness.js";

const KEY = "installation-key-for-tests-0123";
const ALWAYS_OPEN = { days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], from: "00:00", to: "23:59" };
const VENUE = {
  id: "example-museum",
  name: "Example Museum",
  recipients: ["s***@example-museum.org"],
  timezone: "Europe/Stockholm",
  openingHours: ALWAYS_OPEN,
};
const PDF = Buffer.from("%PDF-1.4\n%%EOF\n");

type FakeServer = {
  url: string;
  alerts: Array<Record<string, unknown>>;
  keys: string[];
  down: boolean;
  close: () => Promise<void>;
};

/** Stands in for the council server's /api/installation/* endpoints. */
async function startFakeServer(): Promise<FakeServer> {
  const fake: FakeServer = { url: "", alerts: [], keys: [], down: false, close: async () => {} };
  const server = http.createServer((req, res) => {
    const key = String(req.headers["x-installation-key"]);
    fake.keys.push(key);
    if (fake.down) {
      res.writeHead(503).end("{}");
      return;
    }
    if (key !== KEY) {
      res.writeHead(401, { "Content-Type": "application/json" }).end('{"message":"Invalid installation key"}');
      return;
    }
    if (req.url === "/api/installation/venues") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ venues: [VENUE] }));
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      fake.alerts.push(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>);
      res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  fake.url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  fake.close = () => new Promise((resolve) => server.close(() => resolve()));
  return fake;
}

/** The staff page, served by the council server at `origin`, talking to the bridge. */
function staffPage(bridge: TestBridge, origin?: string) {
  const base = `http://${bridge.host}:${bridge.port}`;
  const send = (method: string, pathname: string, body?: unknown) =>
    fetch(`${base}${pathname}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(origin === undefined ? {} : { Origin: origin }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return {
    saveKey: (key: string | null) => send("PUT", "/v1/installation/key", { key }),
    listVenues: () => send("GET", "/v1/installation/venues"),
    chooseVenue: (venueId: string | null) => send("PUT", "/v1/installation/venue", { venueId }),
    sendTest: () => send("POST", "/v1/alerts/test"),
  };
}

async function alertsHealth(bridge: TestBridge): Promise<Record<string, unknown>> {
  return ((await (await fetch(bridge.healthUrl)).json()) as { alerts: Record<string, unknown> }).alerts;
}

describe("installation key", () => {
  let council: FakeServer;
  let bridge: TestBridge;

  beforeEach(async () => {
    council = await startFakeServer();
    bridge = await startTestBridge({ print: true });
  });

  afterEach(async () => {
    await bridge.stop();
    await council.close();
  });

  it("is saved for the page's own server once it accepts it, kept across restarts, and never shown", async () => {
    expect(await alertsHealth(bridge)).toMatchObject({ server: null, venue: null });

    expect((await staffPage(bridge, council.url).saveKey(KEY)).status).toBe(200);
    await bridge.restart();

    const health = await (await fetch(bridge.healthUrl)).json();
    expect(health.alerts).toMatchObject({ server: council.url });
    expect(JSON.stringify(health)).not.toContain(KEY);
    const file = await stat(path.join(bridge.spoolDir!, "installation.json"));
    expect(file.mode & 0o777).toBe(0o600);
  });

  it.each([
    { name: "a key the server refuses", fromPage: true, key: "not-the-installation-key", status: 409 },
    { name: "a request no page sent", fromPage: false, key: KEY, status: 400 },
    { name: "an empty key", fromPage: true, key: "  ", status: 400 },
  ])("refuses $name", async ({ fromPage, key, status }) => {
    const page = staffPage(bridge, fromPage ? council.url : undefined);
    expect((await page.saveKey(key)).status).toBe(status);
    expect(await alertsHealth(bridge)).toMatchObject({ server: null });
  });

  it("refuses a page from another server", async () => {
    await staffPage(bridge, council.url).saveKey(KEY);
    const elsewhere = staffPage(bridge, "http://localhost:5999");

    expect((await elsewhere.listVenues()).status).toBe(409);
    expect((await elsewhere.chooseVenue("example-museum")).status).toBe(409);
    expect((await elsewhere.sendTest()).status).toBe(409);
  });

  it("forgets the venue when the key is saved for another server", async () => {
    const page = staffPage(bridge, council.url);
    await page.saveKey(KEY);
    await page.chooseVenue("example-museum");

    const other = await startFakeServer();
    try {
      expect((await staffPage(bridge, other.url).saveKey(KEY)).status).toBe(200);
      expect(await alertsHealth(bridge)).toMatchObject({ server: other.url, venue: null });
    } finally {
      await other.close();
    }
  });

  it("turns alerts off when the key is removed", async () => {
    const page = staffPage(bridge, council.url);
    await page.saveKey(KEY);
    expect((await page.saveKey(null)).status).toBe(200);

    await bridge.restart();
    expect(await alertsHealth(bridge)).toMatchObject({ server: null });
    expect((await staffPage(bridge).listVenues()).status).toBe(409);
  });
});

describe("printer alerts", () => {
  let council: FakeServer;
  let bridge: TestBridge;
  let page: ReturnType<typeof staffPage>;
  let base: string;

  beforeEach(async () => {
    council = await startFakeServer();
    bridge = await startTestBridge({ print: true });
    base = `http://${bridge.host}:${bridge.port}`;
    page = staffPage(bridge, council.url);
    await page.saveKey(KEY);
  });

  afterEach(async () => {
    await bridge.stop();
    await council.close();
  });

  const setPrinter = (mode: string) =>
    fetch(`${base}/v1/test/printer`, { method: "POST", body: JSON.stringify({ mode }) });
  const printProtocol = (meetingId: string) =>
    fetch(`${base}/v1/print?meetingId=${meetingId}`, {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: PDF,
    });
  const kinds = () => council.alerts.map((alert) => alert.kind);

  it("lists the server's venues and remembers the choice across restarts", async () => {
    const listed = await (await page.listVenues()).json();
    expect(listed).toMatchObject({ venues: [VENUE], current: null });

    expect((await page.chooseVenue("somewhere-else")).status).toBe(409);
    expect((await page.chooseVenue("example-museum")).status).toBe(200);

    await bridge.restart();
    expect(await alertsHealth(bridge)).toMatchObject({
      venue: { id: "example-museum", name: "Example Museum", recipients: ["s***@example-museum.org"] },
      open: true,
    });
    expect(council.keys.every((key) => key === KEY)).toBe(true);
  });

  it("tells the venue when the printer runs out of paper, and when it is fixed", async () => {
    await page.chooseVenue("example-museum");
    await setPrinter("paper-out");
    await printProtocol("31");

    await waitForCondition(() => kinds().includes("problem"), 5000);
    expect(council.alerts[0]).toMatchObject({
      venueId: "example-museum",
      kind: "problem",
      reason: "media-empty",
      printer: "mock",
      waiting: 1,
      host: "test-mac",
    });

    await setPrinter("ok");
    await waitForCondition(() => kinds().includes("resolved"), 5000);
    expect(kinds()).toEqual(["problem", "resolved"]);
  });

  it("keeps an alert the server could not take, and delivers it once the server is back", async () => {
    await page.chooseVenue("example-museum");
    council.down = true;
    await setPrinter("paper-out");
    await printProtocol("32");

    await waitForCondition(() => bridge.alerts()!.health().lastError !== null, 5000);
    expect(bridge.alerts()!.health().undelivered).toBe(true);

    council.down = false;
    await waitForCondition(() => kinds().includes("problem"), 5000);
    expect(kinds()).toEqual(["problem"]);
    expect(bridge.alerts()!.health()).toMatchObject({ undelivered: false, lastError: null });
  });

  it("sends nothing while no venue is chosen", async () => {
    await setPrinter("paper-out");
    await printProtocol("33");

    await waitForCondition(() => bridge.alerts()!.health().phase === "alerting", 5000);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(council.alerts).toEqual([]);
  });

  it("sends a test alert to the chosen venue, at most once a minute", async () => {
    expect((await page.sendTest()).status).toBe(409); // no venue yet
    await page.chooseVenue("example-museum");
    expect((await page.sendTest()).status).toBe(200);
    expect((await page.sendTest()).status).toBe(409);
    expect(council.alerts).toMatchObject([{ venueId: "example-museum", kind: "test", host: "test-mac" }]);
  });
});
