import type { NetworkSampleBatch } from "../../../shared/networkSamples.js";
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

/** A reply to one of the venue's letters, as the server hands it out to be printed. */
export type LetterReplyToPrint = {
  id: string;
  meetingId: number;
  kind: "reply" | "opt-out";
  fromName: string | null;
  subject: string;
  message: string;
  receivedAt: string;
  letter: { authorId: string; authorName: string; recipientName: string; subject: string; language: string };
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

/** Talks to the council server's `/api/installation/*` endpoints with the installation key. */
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
    const body = (await this.request("GET", "/api/installation/venues")) as { venues?: Venue[] };
    return body.venues ?? [];
  }

  async sendPrinterAlert(alert: PrinterAlertPayload): Promise<void> {
    await this.request("POST", "/api/installation/printer-alerts", alert);
  }

  async sendNetworkSamples(batch: NetworkSampleBatch): Promise<void> {
    await this.request("POST", "/api/installation/network", batch);
  }

  async getLetterReplies(venueId: string): Promise<LetterReplyToPrint[]> {
    const body = (await this.request(
      "GET",
      `/api/installation/letter-replies?venueId=${encodeURIComponent(venueId)}`,
    )) as { replies?: LetterReplyToPrint[] };
    return body.replies ?? [];
  }

  async markLetterReplyPrinted(id: string): Promise<void> {
    await this.request("POST", "/api/installation/letter-replies/printed", { id });
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { "Content-Type": "application/json", "X-Installation-Key": this.key },
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
