import type { IncomingMessage } from "node:http";
import type { MockSerialManager } from "./mockSerialManager.js";

export function isMockSerialManager(serial: unknown): serial is MockSerialManager {
  return (
    typeof serial === "object" &&
    serial != null &&
    "simulateButton" in serial &&
    typeof (serial as MockSerialManager).simulateButton === "function"
  );
}

export function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}
