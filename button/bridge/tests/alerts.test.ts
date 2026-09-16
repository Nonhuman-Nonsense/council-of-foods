import http from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startTestBridge, waitForCondition, type TestBridge } from "./testHarness.js";

const KEY = "bridge-key-for-tests-0123456789";
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

/** Stands in for the council server's /api/bridge/* endpoints. */
async function startFakeServer(): Promise<FakeServer> {
  const fake: FakeServer = { url: "", alerts: [], keys: [], down: false, close: async () => {} };
  const server = http.createServer((req, res) => {
    fake.keys.push(String(req.headers["x-bridge-key"]));
    if (fake.down) {
      res.writeHead(503).end("{}");
      return;
    }
    if (req.url === "/api/bridge/venues") {
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

describe("printer alerts", () => {
  let council: FakeServer;
  let bridge: TestBridge;
  let base: string;

  beforeEach(async () => {
    council = await startFakeServer();
    bridge = await startTestBridge({ print: true, alertServer: { url: council.url, key: KEY } });
    base = `http://${bridge.host}:${bridge.port}`;
  });

  afterEach(async () => {
    await bridge.stop();
    await council.close();
  });

  const chooseVenue = (venueId: string | null) =>
    fetch(`${base}/v1/alerts/venue`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venueId }),
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
    const listed = await (await fetch(`${base}/v1/alerts/venues`)).json();
    expect(listed).toMatchObject({ venues: [VENUE], current: null });

    expect((await chooseVenue("somewhere-else")).status).toBe(409);
    expect((await chooseVenue("example-museum")).status).toBe(200);

    await bridge.restart();
    const health = await (await fetch(bridge.healthUrl)).json();
    expect(health.alerts).toMatchObject({
      configured: true,
      venue: { id: "example-museum", name: "Example Museum", recipients: ["s***@example-museum.org"] },
      open: true,
    });
    expect(JSON.stringify(health)).not.toContain(KEY);
    expect(council.keys.every((key) => key === KEY)).toBe(true);
  });

  it("tells the venue when the printer runs out of paper, and when it is fixed", async () => {
    await chooseVenue("example-museum");
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
    await chooseVenue("example-museum");
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
    const test = () => fetch(`${base}/v1/alerts/test`, { method: "POST" });

    expect((await test()).status).toBe(409); // no venue yet
    await chooseVenue("example-museum");
    expect((await test()).status).toBe(200);
    expect((await test()).status).toBe(409);
    expect(council.alerts).toMatchObject([{ venueId: "example-museum", kind: "test", host: "test-mac" }]);
  });
});

describe("printer alerts without a council server", () => {
  it("reports alerts as not configured and refuses venue requests", async () => {
    const bridge = await startTestBridge({ print: true });
    try {
      const health = await (await fetch(bridge.healthUrl)).json();
      expect(health.alerts).toMatchObject({ configured: false, venue: null });
      expect((await fetch(`http://${bridge.host}:${bridge.port}/v1/alerts/venues`)).status).toBe(409);
    } finally {
      await bridge.stop();
    }
  });
});
