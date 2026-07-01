/**
 * Pure (React-free) WebRTC connection helper for provider-backed Realtime APIs.
 *
 * The contract is intentionally tiny: open a peer connection with a mic track,
 * a single data channel ("oai-events"), exchange SDP via our server proxy, and
 * surface remote audio + data channel events through callbacks. Everything
 * else (status state, captions, tool dispatch) lives one layer up.
 */

import type { RealtimeSessionServerDefaults } from "./realtimeProtocol";
import type { IceServer, RealtimeBootstrapResponse } from "@shared/RealtimeSessionTypes";
import { councilFetch } from "@/api/http";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/** Thrown when bootstrap or SDP exchange returns a non-OK HTTP response. */
export class RealtimeHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RealtimeHttpError";
  }
}

// ---------------------------------------------------------------------------
// Error classifier
// ---------------------------------------------------------------------------

export type RealtimeErrorKind = "fatal" | "retryable";

/**
 * Classify a realtime connection error as fatal (won't recover with retries)
 * or retryable (transient — worth attempting again).
 *
 * `isMuseumMode` affects mic-permission handling: kiosks should always have a
 * mic, so `NotAllowedError` is treated as a transient OS hiccup there.
 */
export function classifyRealtimeError(
  err: unknown,
  opts?: { isMuseumMode?: boolean },
): RealtimeErrorKind {
  if (err instanceof RealtimeHttpError) {
    // 4xx = configuration/auth error — retrying won't help
    if (err.status >= 400 && err.status < 500) return "fatal";
    // 5xx = server/provider blip — worth retrying
    return "retryable";
  }
  // Invalid bootstrap shape — a structural/config problem
  if (err instanceof Error && err.message.includes("response invalid")) return "fatal";
  // Mic permission denied: fatal on web (user choice), retryable in museum (OS hiccup)
  if (err instanceof Error && err.name === "NotAllowedError") {
    return opts?.isMuseumMode ? "retryable" : "fatal";
  }
  // Everything else (network, ICE timeout, pc_failed, dc_error, etc.) = retryable
  return "retryable";
}

// ---------------------------------------------------------------------------
// Backoff
// ---------------------------------------------------------------------------

export const REALTIME_RETRY_BASE_MS = 1_000;
export const REALTIME_RETRY_MAX_MS = 15_000;

/**
 * Full-jitter exponential backoff delay for a given attempt index (0-based).
 * Returns a random value in [0, min(MAX, BASE * 2^attempt)].
 */
export function computeRealtimeRetryDelay(attempt: number): number {
  const cap = Math.min(REALTIME_RETRY_MAX_MS, REALTIME_RETRY_BASE_MS * 2 ** attempt);
  return Math.random() * cap;
}

export type ConnectionLogger = (...args: unknown[]) => void;

export type RealtimeConnection = {
  /** Active peer connection. */
  pc: RTCPeerConnection;
  /** Active data channel ("oai-events"). */
  dc: RTCDataChannel;
  /** Local microphone stream we created (so callers can stop tracks). */
  micStream: MediaStream;
  /** Closes everything in the right order; safe to call multiple times. */
  close: () => void;
};

export type CreateConnectionParams = {
  /** Full provider-owned session sent to the app server at /call time. */
  session: Record<string, unknown>;
  /** From bootstrap (browser seeds `RTCPeerConnection`). */
  iceServers: IceServer[];
  /** App-server call endpoint that proxies to the upstream realtime provider. */
  callPath: string;
  /** Optional extra headers such as live-key auth. */
  callHeaders?: HeadersInit;
  /** Optional extra JSON fields appended to the call body. */
  callBodyExtras?: Record<string, unknown>;
  /**
   * When passed (e.g. acquired in parallel with bootstrap in the hook), skips an
   * internal `getUserMedia` call.
   */
  micStream?: MediaStream;
  /** Forwarded to ontrack so the caller can attach <audio>. */
  onRemoteTrack: (track: MediaStreamTrack) => void;
  /** Receives all data channel JSON events. */
  onEvent: (event: unknown) => void;
  /** Called when the data channel opens (e.g. Inworld expects `session.update` here over WebRTC). */
  onOpen?: (ctx: { dc: RTCDataChannel }) => void;
  /** Called when the channel/peer closes (or errors). */
  onClose?: (reason: "dc_close" | "dc_error" | "pc_failed") => void;
  /** Optional debug hook. */
  log?: ConnectionLogger;
  /**
   * Optional abort signal. When fired, in-flight network/getUserMedia calls
   * are cancelled and any partial state is closed. Critical for surviving
   * React StrictMode's mount/unmount/mount cycle in dev.
   */
  signal?: AbortSignal;
};

const ICE_GATHER_TIMEOUT_MS = 2_500;
const FETCH_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort);
  try {
    if (externalSignal?.aborted) controller.abort();
    return await councilFetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

class AbortError extends Error {
  constructor() {
    super("aborted");
    this.name = "AbortError";
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new AbortError();
}

async function waitForIceGatheringComplete(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeout);
      pc.removeEventListener("icegatheringstatechange", onState);
      pc.removeEventListener("icecandidate", onCandidate);
    };

    const onState = () => {
      if (pc.iceGatheringState === "complete") {
        cleanup();
        resolve();
      }
    };
    const onCandidate = (e: RTCPeerConnectionIceEvent) => {
      if (e.candidate == null) {
        cleanup();
        resolve();
      }
    };

    pc.addEventListener("icegatheringstatechange", onState);
    pc.addEventListener("icecandidate", onCandidate);
  });
}

function parseRealtimeSessionServerDefaults(
  session: unknown,
  context: string
): RealtimeSessionServerDefaults {
  const s = session as RealtimeSessionServerDefaults | null | undefined;
  if (
    !s ||
    s.type !== "realtime" ||
    typeof s.model !== "string" ||
    !Array.isArray(s.output_modalities)
  ) {
    throw new Error(`${context}: response invalid`);
  }
  return s;
}

/**
 * One HTTP round-trip: shared app realtime bootstrap for a given feature.
 *
 * Pass `extraHeaders` to include additional headers such as `Authorization`
 * for protected features like `meta-agent` and `human-input`.
 */
export async function fetchRealtimeBootstrap(
  requestBody: Record<string, unknown>,
  log: ConnectionLogger = () => undefined,
  signal?: AbortSignal,
  extraHeaders?: HeadersInit
): Promise<RealtimeBootstrapResponse & { session: RealtimeSessionServerDefaults }> {
  log("POST /api/realtime/bootstrap");
  const resp = await fetchWithTimeout(
    "/api/realtime/bootstrap",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(extraHeaders ?? {}) },
      body: JSON.stringify(requestBody),
    },
    FETCH_TIMEOUT_MS,
    signal
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new RealtimeHttpError(resp.status, `Realtime bootstrap failed (${resp.status}): ${text}`);
  }
  const data = (await resp.json()) as RealtimeBootstrapResponse;
  const session = parseRealtimeSessionServerDefaults(data?.session, "Realtime bootstrap");
  const iceServers = Array.isArray(data?.iceServers) ? (data.iceServers as IceServer[]) : [];
  log("bootstrap ok", { ice: iceServers.length, model: session.model });
  return { provider: data.provider ?? "inworld", iceServers, session };
}

/** Loads model / audio / VAD defaults from the server. Instructions/tools are merged client-side. */
export async function fetchRealtimeSessionDefaults(
  requestBody: Record<string, unknown>,
  log: ConnectionLogger = () => undefined,
  signal?: AbortSignal
): Promise<RealtimeSessionServerDefaults> {
  const { session } = await fetchRealtimeBootstrap(requestBody, log, signal);
  return session;
}

async function exchangeSdp(
  sdpOffer: string,
  session: Record<string, unknown>,
  callPath: string,
  callHeaders: HeadersInit | undefined,
  callBodyExtras: Record<string, unknown> | undefined,
  log: ConnectionLogger,
  signal?: AbortSignal
): Promise<string> {
  log(`POST ${callPath}`);
  const resp = await fetchWithTimeout(
    callPath,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(callHeaders ?? {}) },
      body: JSON.stringify({ sdp: sdpOffer, session, ...(callBodyExtras ?? {}) }),
    },
    FETCH_TIMEOUT_MS,
    signal
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new RealtimeHttpError(resp.status, `Call create failed (${resp.status}): ${text}`);
  }
  const data = (await resp.json()) as { sdp?: unknown };
  const sdp = typeof data.sdp === "string" ? data.sdp : null;
  if (!sdp) throw new Error("Call create returned no sdp");
  return sdp;
}

/**
 * Build a fully-wired provider-backed Realtime WebRTC connection.
 *
 * Resolves once SDP has been exchanged and `setRemoteDescription` succeeded.
 * The data channel may still be opening at that point — `onOpen` fires later.
 *
 * If `signal` is aborted at any point, in-flight network/getUserMedia calls
 * are torn down and an `AbortError` is thrown. Callers can use
 * `(err.name === "AbortError")` to distinguish.
 */
export async function createRealtimeConnection(params: CreateConnectionParams): Promise<RealtimeConnection> {
  const {
    session,
    iceServers,
    callPath,
    callHeaders,
    callBodyExtras,
    micStream: micStreamParam,
    onRemoteTrack,
    onEvent,
    onOpen,
    onClose,
    log = () => undefined,
    signal,
  } = params;

  let pc: RTCPeerConnection | null = null;
  let dc: RTCDataChannel | null = null;
  let micStream: MediaStream | null = null;

  const teardownPartial = () => {
    try {
      dc?.close();
    } catch { /* ignore */ }
    try {
      pc?.getSenders().forEach((s) => s.track?.stop());
      pc?.close();
    } catch { /* ignore */ }
    try {
      micStream?.getTracks().forEach((t) => t.stop());
    } catch { /* ignore */ }
  };

  try {
    throwIfAborted(signal);

    if (micStreamParam) {
      micStream = micStreamParam;
    } else {
      log("getUserMedia");
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    }
    throwIfAborted(signal);

    pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 10 });
    log("peer connection created");

    pc.onconnectionstatechange = () => {
      log("pc connectionState", pc!.connectionState);
      if (pc!.connectionState === "failed") onClose?.("pc_failed");
    };
    pc.oniceconnectionstatechange = () => log("pc iceConnectionState", pc!.iceConnectionState);

    dc = pc.createDataChannel("oai-events", { ordered: true });
    dc.onopen = () => {
      log("data channel open");
      const openDc = dc!;
      onOpen?.({ dc: openDc });
    };
    dc.onclose = () => {
      log("data channel closed");
      onClose?.("dc_close");
    };
    dc.onerror = (e) => {
      log("data channel error", e);
      onClose?.("dc_error");
    };
    dc.onmessage = (evt) => {
      if (typeof evt.data !== "string") return;
      try {
        const parsed = JSON.parse(evt.data) as unknown;
        onEvent(parsed);
      } catch {
        /* drop */
      }
    };

    pc.ontrack = (e) => {
      log("remote track", e.track.kind, e.track.readyState);
      if (e.track.kind === "audio") onRemoteTrack(e.track);
    };

    micStream.getAudioTracks().forEach((t) => pc!.addTrack(t, micStream!));

    log("createOffer");
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc, ICE_GATHER_TIMEOUT_MS);
    throwIfAborted(signal);

    const sdpOffer = pc.localDescription?.sdp;
    if (!sdpOffer) throw new Error("Missing SDP offer");

    const sdpAnswer = await exchangeSdp(sdpOffer, session, callPath, callHeaders, callBodyExtras, log, signal);
    throwIfAborted(signal);
    await pc.setRemoteDescription({ type: "answer", sdp: sdpAnswer });
    log("setRemoteDescription ok");

    let closed = false;
    const finalPc = pc;
    const finalDc = dc;
    const finalMic = micStream;
    const close = () => {
      if (closed) return;
      closed = true;
      try {
        finalDc.close();
      } catch { /* ignore */ }
      try {
        finalPc.getSenders().forEach((s) => s.track?.stop());
        finalPc.close();
      } catch { /* ignore */ }
      try {
        finalMic.getTracks().forEach((t) => t.stop());
      } catch { /* ignore */ }
    };

    return { pc: finalPc, dc: finalDc, micStream: finalMic, close };
  } catch (err) {
    teardownPartial();
    throw err;
  }
}
