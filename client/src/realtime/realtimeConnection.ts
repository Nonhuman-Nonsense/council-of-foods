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

/**
 * Thrown when a realtime HTTP call exceeds its own timeout.
 *
 * Deliberately *not* an `AbortError`: callers use `AbortError` to mean "we
 * cancelled this ourselves, drop it silently", and a timeout is the opposite —
 * nobody asked for it and it should be retried. Before this existed, a visitor
 * who left the mic permission prompt open longer than the bootstrap timeout
 * silently stranded the session in "connecting" forever.
 */
export class RealtimeTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RealtimeTimeoutError";
  }
}

/** Why microphone acquisition failed. Drives error classification + messaging. */
export type MicrophoneErrorReason =
  | "insecure_context" // page not served over HTTPS/localhost — mediaDevices unavailable
  | "unsupported" // browser has no getUserMedia at all
  | "permission_denied" // user or policy blocked mic access
  | "not_found" // no microphone hardware present
  | "in_use" // mic held by another app / not readable
  | "unknown";

/**
 * Thrown by {@link acquireMicrophone} when the mic can't be obtained. Carries a
 * `reason` so callers can classify (some causes are permanent, some transient)
 * and a human-readable `message` safe to surface in the UI.
 */
export class MicrophoneUnavailableError extends Error {
  /** The underlying DOMException/error, when available. */
  readonly originalError?: unknown;

  constructor(
    readonly reason: MicrophoneErrorReason,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = "MicrophoneUnavailableError";
    this.originalError = options?.cause;
  }
}

const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
};

/**
 * Acquire the microphone with an explicit guard + normalized errors.
 *
 * Unlike a bare `navigator.mediaDevices.getUserMedia(...)`, this:
 *  - fails with a clear {@link MicrophoneUnavailableError} when `mediaDevices`
 *    is missing (non-secure context / unsupported browser) instead of throwing
 *    an opaque `TypeError` that gets misclassified as a retryable network blip;
 *  - maps each DOMException name to a specific reason + user-facing message.
 */
export async function acquireMicrophone(): Promise<MediaStream> {
  const mediaDevices =
    typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;

  if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
    const insecure =
      typeof window !== "undefined" && window.isSecureContext === false;
    throw new MicrophoneUnavailableError(
      insecure ? "insecure_context" : "unsupported",
      insecure
        ? "Microphone access requires a secure (HTTPS) connection."
        : "This browser does not support microphone access.",
    );
  }

  try {
    return await mediaDevices.getUserMedia(MIC_CONSTRAINTS);
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    switch (name) {
      case "NotAllowedError":
      case "SecurityError":
        throw new MicrophoneUnavailableError(
          "permission_denied",
          "Microphone access was blocked. Please allow microphone access and try again.",
          { cause: err },
        );
      case "NotFoundError":
      case "OverconstrainedError":
        throw new MicrophoneUnavailableError(
          "not_found",
          "No microphone was found on this device.",
          { cause: err },
        );
      case "NotReadableError":
        throw new MicrophoneUnavailableError(
          "in_use",
          "The microphone is unavailable — it may be in use by another application.",
          { cause: err },
        );
      default:
        throw new MicrophoneUnavailableError(
          "unknown",
          err instanceof Error && err.message
            ? err.message
            : "The microphone could not be accessed.",
          { cause: err },
        );
    }
  }
}

// ---------------------------------------------------------------------------
// Error classifier
// ---------------------------------------------------------------------------

/**
 * - `fatal` — retrying won't help and the app cannot continue as intended.
 * - `retryable` — transient, worth another attempt.
 * - `unavailable` — the voice agent can't run, but the app is fine without it.
 *   Web-only: the visitor keeps a fully usable, clickable interface.
 */
export type RealtimeErrorKind = "fatal" | "retryable" | "unavailable";

/**
 * Classify a realtime connection error.
 *
 * `unattended` decides how microphone failures land. A kiosk with no working
 * mic is genuinely broken and should surface as a terminal error, since nobody
 * is there to grant a permission; a web visitor who declines the prompt has
 * simply chosen not to talk, and the setup flow still works by clicking.
 */
export function classifyRealtimeError(
  err: unknown,
  opts?: { unattended?: boolean },
): RealtimeErrorKind {
  if (err instanceof RealtimeHttpError) {
    // 4xx = configuration/auth error — retrying won't help
    if (err.status >= 400 && err.status < 500) return "fatal";
    // 5xx = server/provider blip — worth retrying
    return "retryable";
  }
  // Invalid bootstrap shape — a structural/config problem
  if (err instanceof Error && err.message.includes("response invalid")) return "fatal";
  // Microphone failures never resolve by retrying — a blocked permission,
  // missing hardware or busy device all need the user (or a technician) to act.
  if (err instanceof MicrophoneUnavailableError) {
    return opts?.unattended ? "fatal" : "unavailable";
  }
  // Legacy path (should now be wrapped by MicrophoneUnavailableError).
  if (err instanceof Error && err.name === "NotAllowedError") {
    return opts?.unattended ? "fatal" : "unavailable";
  }
  // Everything else (network, timeout, ICE, pc_failed, dc_error, etc.) = retryable
  return "retryable";
}

// ---------------------------------------------------------------------------
// Microphone permission state
// ---------------------------------------------------------------------------

/** `"unsupported"` means the Permissions API can't tell us — assume a prompt. */
export type MicPermissionState = "granted" | "prompt" | "denied" | "unsupported";

/** Permissions API support for the `microphone` name is uneven (Chromium yes,
 *  Firefox rejects the name, Safari partial), so every path is guarded. */
function micPermissionQuery(): Promise<PermissionStatus> | null {
  const permissions = typeof navigator !== "undefined" ? navigator.permissions : undefined;
  if (!permissions || typeof permissions.query !== "function") return null;
  try {
    return permissions.query({ name: "microphone" as PermissionName });
  } catch {
    return null;
  }
}

/**
 * Best-effort read of the microphone permission, used to decide whether a
 * `getUserMedia` call would prompt, succeed silently, or fail instantly.
 * Never throws — an unknown answer is reported as `"unsupported"`.
 */
export async function queryMicPermission(): Promise<MicPermissionState> {
  const query = micPermissionQuery();
  if (!query) return "unsupported";
  try {
    const status = await query;
    return status.state as MicPermissionState;
  } catch {
    return "unsupported";
  }
}

/**
 * Subscribe to microphone permission changes, so a visitor who allows the mic
 * from browser site settings is noticed without a page reload.
 * Returns an unsubscribe function; a no-op where the API is unsupported.
 */
export function watchMicPermission(
  onChange: (state: MicPermissionState) => void,
): () => void {
  let cancelled = false;
  let detach: (() => void) | null = null;

  const query = micPermissionQuery();
  if (query) {
    void query
      .then((status) => {
        if (cancelled) return;
        const handler = () => onChange(status.state as MicPermissionState);
        status.addEventListener("change", handler);
        detach = () => status.removeEventListener("change", handler);
      })
      .catch(() => {
        /* unsupported — nothing to watch */
      });
  }

  return () => {
    cancelled = true;
    detach?.();
    detach = null;
  };
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
  /**
   * Microphone stream currently being sent, or `null` when the session is
   * listening-only. Mutates on {@link RealtimeConnection.attachMic} /
   * {@link RealtimeConnection.detachMic} — read it, don't cache it.
   */
  micStream: MediaStream | null;
  /**
   * Start sending a microphone without renegotiating: the audio sender already
   * exists (see `deferMic`), so `replaceTrack` is enough. Any previously
   * attached stream is stopped and released.
   */
  attachMic: (stream: MediaStream) => Promise<void>;
  /**
   * Stop sending audio and release the microphone (so the browser's recording
   * indicator goes away). The sender stays in place, so a later `attachMic`
   * needs no renegotiation either.
   */
  detachMic: () => void;
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
   * The microphone to send. Required unless `deferMic` is set — callers acquire
   * it themselves (through `requestMicrophone`, so the availability store sees
   * the outcome) rather than letting this module prompt behind their back.
   */
  micStream?: MediaStream;
  /**
   * Connect without a microphone — no `getUserMedia`, so **no permission
   * prompt**. An empty `sendrecv` audio transceiver is negotiated instead, so
   * the agent can talk immediately and the visitor can hand over their mic
   * later via {@link RealtimeConnection.attachMic} with no renegotiation.
   *
   * Verified against Inworld: the empty m-line is accepted, and transcription
   * starts as soon as packets appear.
   */
  deferMic?: boolean;
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

/** Peer/ICE states worth logging — the happy-path progression is just noise. */
const PROBLEM_CONNECTION_STATES = new Set(["disconnected", "failed", "closed"]);

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort);
  try {
    if (externalSignal?.aborted) controller.abort();
    return await councilFetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    // Re-brand our own timeout so callers don't mistake it for a caller-driven
    // cancellation and drop the session on the floor.
    if (timedOut && !externalSignal?.aborted) {
      throw new RealtimeTimeoutError(`Realtime request timed out after ${timeoutMs}ms`);
    }
    throw err;
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
  signal?: AbortSignal,
  extraHeaders?: HeadersInit
): Promise<RealtimeBootstrapResponse & { session: RealtimeSessionServerDefaults }> {
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
  return { provider: data.provider ?? "inworld", iceServers, session };
}

async function exchangeSdp(
  sdpOffer: string,
  session: Record<string, unknown>,
  callPath: string,
  callHeaders: HeadersInit | undefined,
  callBodyExtras: Record<string, unknown> | undefined,
  signal?: AbortSignal
): Promise<string> {
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
    deferMic = false,
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
  let audioSender: RTCRtpSender | null = null;

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

    // Deferred-mic sessions connect without getUserMedia, so they never prompt.
    if (!deferMic) {
      if (!micStreamParam) {
        throw new Error("createRealtimeConnection needs a micStream unless deferMic is set");
      }
      micStream = micStreamParam;
    }
    throwIfAborted(signal);

    pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 10 });

    pc.onconnectionstatechange = () => {
      if (PROBLEM_CONNECTION_STATES.has(pc!.connectionState)) log("pc connectionState", pc!.connectionState);
      if (pc!.connectionState === "failed") onClose?.("pc_failed");
    };
    pc.oniceconnectionstatechange = () => {
      if (PROBLEM_CONNECTION_STATES.has(pc!.iceConnectionState)) log("pc iceConnectionState", pc!.iceConnectionState);
    };

    dc = pc.createDataChannel("oai-events", { ordered: true });
    dc.onopen = () => {
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
      if (e.track.kind === "audio") onRemoteTrack(e.track);
    };

    if (micStream) {
      micStream.getAudioTracks().forEach((t) => {
        audioSender = pc!.addTrack(t, micStream!);
      });
    } else {
      // Empty sendrecv transceiver: the m-line is negotiated as if a mic were
      // present, so attaching one later is a plain replaceTrack. Nothing is
      // sent until then — no packets, no input-audio cost.
      audioSender = pc.addTransceiver("audio", { direction: "sendrecv" }).sender;
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc, ICE_GATHER_TIMEOUT_MS);
    throwIfAborted(signal);

    const sdpOffer = pc.localDescription?.sdp;
    if (!sdpOffer) throw new Error("Missing SDP offer");

    const sdpAnswer = await exchangeSdp(sdpOffer, session, callPath, callHeaders, callBodyExtras, signal);
    throwIfAborted(signal);
    await pc.setRemoteDescription({ type: "answer", sdp: sdpAnswer });

    let closed = false;
    const finalPc = pc;
    const finalDc = dc;
    const finalSender = audioSender;

    const stopMic = () => {
      try {
        connection.micStream?.getTracks().forEach((t) => t.stop());
      } catch { /* ignore */ }
      connection.micStream = null;
    };

    const connection: RealtimeConnection = {
      pc: finalPc,
      dc: finalDc,
      micStream,

      attachMic: async (stream: MediaStream) => {
        if (closed) return;
        const track = stream.getAudioTracks()[0];
        if (!track) throw new Error("Microphone stream has no audio track");
        if (!finalSender) throw new Error("Realtime connection has no audio sender");
        await finalSender.replaceTrack(track);
        // Release the previous mic only once the new one is live, so a failed
        // swap leaves the session audible rather than silently deaf.
        stopMic();
        connection.micStream = stream;
        log("mic attached");
      },

      detachMic: () => {
        if (closed) return;
        void finalSender?.replaceTrack(null).catch(() => { /* already gone */ });
        stopMic();
        log("mic detached");
      },

      close: () => {
        if (closed) return;
        closed = true;
        try {
          finalDc.close();
        } catch { /* ignore */ }
        try {
          finalPc.getSenders().forEach((s) => s.track?.stop());
          finalPc.close();
        } catch { /* ignore */ }
        stopMic();
      },
    };

    return connection;
  } catch (err) {
    teardownPartial();
    throw err;
  }
}
