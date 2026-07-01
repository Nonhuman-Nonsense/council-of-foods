import type { SerialDiagnostics } from "./serialDiagnostics.js";

export type SerialManagerLike = {
  on(event: "open", listener: (payload: { path: string }) => void): void;
  on(event: "close", listener: (payload: { reason: string }) => void): void;
  on(event: "line", listener: (payload: { text: string }) => void): void;
  on(event: "error", listener: (payload: { message: string }) => void): void;
  start(): void;
  stop(): Promise<void>;
  writeLine(line: string): Promise<void>;
  getOpenPath(): string | null;
  isOpen(): boolean;
  getDiagnostics(): SerialDiagnostics;
};
