import type { OpeningHours } from "./openingHours.js";

/** A venue as the council server lists it for bridges; recipients come masked. */
export type Venue = {
  id: string;
  name: string;
  recipients: string[];
  timezone: string;
  openingHours: OpeningHours;
};

export type PrinterAlertPayload = {
  venueId: string;
  kind: "problem" | "reminder" | "resolved" | "test";
  reason?: string;
  since?: string;
  printer?: string | null;
  waiting?: number;
  host?: string;
};

export class ServerError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }
}

const REQUEST_TIMEOUT_MS = 20_000;

/** Talks to the council server's `/api/bridge/*` endpoints with the bridge key. */
export class ServerClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly key: string,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async getVenues(): Promise<Venue[]> {
    const body = (await this.request("GET", "/api/bridge/venues")) as { venues?: Venue[] };
    return body.venues ?? [];
  }

  async sendPrinterAlert(alert: PrinterAlertPayload): Promise<void> {
    await this.request("POST", "/api/bridge/printer-alerts", alert);
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { "Content-Type": "application/json", "X-Bridge-Key": this.key },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ServerError(`council server unreachable: ${detail}`, null);
    }
    const text = await response.text();
    if (!response.ok) {
      let message = text;
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? text;
      } catch {
        // not JSON
      }
      throw new ServerError(`council server answered ${response.status}: ${message}`, response.status);
    }
    return text ? (JSON.parse(text) as unknown) : {};
  }
}
