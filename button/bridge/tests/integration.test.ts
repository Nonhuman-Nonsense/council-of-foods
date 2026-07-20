import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { startTestBridge, waitForTicks, waitForWrittenLine, type TestBridge } from "./testHarness.js";

describe("bridge integration", () => {
  let bridge: TestBridge;

  beforeEach(async () => {
    bridge = await startTestBridge();
  });

  afterEach(async () => {
    await bridge.stop();
  });

  it("serves health with serial status", async () => {
    const response = await fetch(bridge.healthUrl);
    const body = await response.json();

    expect(response.ok).toBe(true);
    expect(body.ok).toBe(true);
    expect(body.version).toBe("1.0.0");
    expect(body.serial).toBe("connected");
    expect(body.path).toBe("mock");
    expect(body.serialDetail).toBe("connected");
    expect(body.serialMessage).toContain("Council button connected");
    expect(body.expectedVendorId).toBe("2341");
    expect(body.scannedPorts).toEqual([]);
  });

  it("allows CORS from local dev origins", async () => {
    const response = await fetch(bridge.healthUrl, {
      headers: { Origin: "http://localhost:5173" },
    });

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    expect(response.ok).toBe(true);
  });

  it("handles health preflight", async () => {
    const response = await fetch(bridge.healthUrl, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173" },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });

  it("allows CORS from deployed museum origins", async () => {
    const response = await fetch(bridge.healthUrl, {
      headers: { Origin: "https://test.council-of-forest.com" },
    });

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://test.council-of-forest.com",
    );
    expect(response.ok).toBe(true);
  });

  it("completes websocket HELLO_COUNCIL roundtrip", async () => {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("websocket handshake timed out")), 10_000);
      const socket = new WebSocket(bridge.wsUrl);

      socket.on("message", (data) => {
        const message = JSON.parse(String(data));
        if (message.type === "status" && message.state === "connected") {
          socket.send(JSON.stringify({ type: "write", line: "HELLO_COUNCIL" }));
        }
        if (message.type === "line" && message.text === "READY council-button") {
          clearTimeout(timeout);
          socket.close();
          resolve();
        }
      });

      socket.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }, 15_000);

  it("forwards host LED commands to mock serial", async () => {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("LED command timed out")), 5000);
      const socket = new WebSocket(bridge.wsUrl);

      socket.on("open", () => {
        socket.send(JSON.stringify({ type: "write", line: "LED_PULSE" }));
      });

      socket.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      void waitForWrittenLine(bridge, "LED_PULSE").then(() => {
        clearTimeout(timeout);
        socket.close();
        resolve();
      }, reject);
    });

    expect(bridge.getWrittenLines()).toContain("LED_PULSE");
  });

  it("signals LED_ERROR when the last websocket client disconnects", async () => {
    const socket = new WebSocket(bridge.wsUrl);
    await new Promise<void>((resolve, reject) => {
      socket.on("open", () => resolve());
      socket.on("error", reject);
    });

    bridge.clearWrittenLines();
    socket.close();
    await waitForWrittenLine(bridge, "LED_ERROR");

    expect(bridge.getWrittenLines()).toContain("LED_ERROR");
  });

  it("signals LED_ERROR when serial reconnects with no client attached", async () => {
    bridge.simulateUsbDisconnect();
    bridge.clearWrittenLines();
    bridge.simulateUsbReconnect();

    await waitForWrittenLine(bridge, "LED_ERROR");

    expect(bridge.getWrittenLines()).toContain("LED_ERROR");
  });

  it("does not signal LED_ERROR while a websocket client is attached", async () => {
    const socket = new WebSocket(bridge.wsUrl);
    await new Promise<void>((resolve, reject) => {
      socket.on("open", () => resolve());
      socket.on("error", reject);
    });

    bridge.clearWrittenLines();
    bridge.simulateUsbDisconnect();
    bridge.simulateUsbReconnect();
    await waitForTicks(10);

    expect(bridge.getWrittenLines()).not.toContain("LED_ERROR");
    socket.close();
  });

  it("forwards mock button presses to websocket clients", async () => {
    const lines: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("button line timed out")), 5000);
      const socket = new WebSocket(bridge.wsUrl);

      socket.on("message", (data) => {
        const message = JSON.parse(String(data));
        if (message.type === "line") {
          lines.push(message.text);
          if (lines.includes("BUTTON_DOWN") && lines.includes("BUTTON_UP")) {
            clearTimeout(timeout);
            socket.close();
            resolve();
          }
        }
      });

      socket.on("open", () => {
        bridge.simulateButtonDown();
        bridge.simulateButtonUp();
      });

      socket.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    expect(lines).toEqual(expect.arrayContaining(["BUTTON_DOWN", "BUTTON_UP"]));
  });
});
