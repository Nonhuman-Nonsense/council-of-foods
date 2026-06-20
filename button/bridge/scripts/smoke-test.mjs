#!/usr/bin/env node
/**
 * Quick smoke test for a running button-bridge instance.
 * Usage: node scripts/smoke-test.mjs [host] [port]
 */
const host = process.argv[2] ?? "127.0.0.1";
const port = Number.parseInt(process.argv[3] ?? "8765", 10);
const healthUrl = `http://${host}:${port}/health`;
const wsUrl = `ws://${host}:${port}/v1/button`;

async function checkHealth() {
  const response = await fetch(healthUrl);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  const body = await response.json();
  console.log("health:", body);
  if (!body.ok) {
    throw new Error("Health response not ok");
  }
}

async function checkWebSocket() {
  const { default: WebSocket } = await import("ws");
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("WebSocket smoke test timed out"));
    }, 5000);

    const socket = new WebSocket(wsUrl);
    let sawPong = false;

    socket.on("message", (data) => {
      const message = JSON.parse(String(data));
      if (message.type === "status" && message.state === "connected") {
        socket.send(JSON.stringify({ type: "write", line: "PING" }));
      }
      if (message.type === "line" && message.text === "PONG") {
        sawPong = true;
        clearTimeout(timeout);
        socket.close();
        resolve();
      }
    });

    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    socket.on("close", () => {
      if (!sawPong) {
        clearTimeout(timeout);
        reject(new Error("WebSocket closed before PONG"));
      }
    });
  });
  console.log("websocket: PING/PONG ok");
}

try {
  await checkHealth();
  await checkWebSocket();
  console.log("smoke test passed");
} catch (error) {
  console.error("smoke test failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
