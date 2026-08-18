import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  acquireMicrophone,
  createRealtimeConnection,
  fetchRealtimeBootstrap,
  MicrophoneUnavailableError,
  RealtimeHttpError,
  classifyRealtimeError,
  computeRealtimeRetryDelay,
  queryMicPermission,
  RealtimeTimeoutError,
  REALTIME_RETRY_BASE_MS,
  REALTIME_RETRY_MAX_MS,
} from "@realtime/realtimeConnection";

class MockTrack {
  kind: string;
  readyState = "live";
  stop = vi.fn(() => {
    this.readyState = "ended";
  });

  constructor(kind: string) {
    this.kind = kind;
  }
}

class MockMediaStream {
  private readonly tracks: MockTrack[];

  constructor(tracks: MockTrack[] = [new MockTrack("audio")]) {
    this.tracks = tracks;
  }

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }

  getTracks() {
    return this.tracks;
  }
}

class MockDataChannel {
  readyState = "open";
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
}

type Listener = (event?: unknown) => void;

type MockSender = {
  track: MockTrack | null;
  replaceTrack: (track: MockTrack | null) => Promise<void>;
};

function makeSender(track: MockTrack | null): MockSender {
  const sender: MockSender = {
    track,
    replaceTrack: vi.fn(async (next: MockTrack | null) => {
      sender.track = next;
    }),
  };
  return sender;
}

class MockPeerConnection {
  static instances: MockPeerConnection[] = [];
  static nextIceGatheringState: "new" | "gathering" | "complete" = "complete";

  readonly createdDataChannel = new MockDataChannel();
  readonly senders: MockSender[] = [];
  readonly transceivers: Array<{ kind: string; init?: RTCRtpTransceiverInit }> = [];
  readonly listeners = new Map<string, Set<Listener>>();
  connectionState = "new";
  iceConnectionState = "new";
  iceGatheringState: "new" | "gathering" | "complete";
  localDescription: { type: "offer"; sdp: string } | null = null;
  remoteDescription: { type: "answer"; sdp: string } | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  ontrack: ((event: { track: MockTrack }) => void) | null = null;
  close = vi.fn();
  createOffer = vi.fn(async () => ({ type: "offer" as const, sdp: "offer-sdp" }));
  setLocalDescription = vi.fn(async (offer: { type: "offer"; sdp: string }) => {
    this.localDescription = offer;
    if (this.iceGatheringState !== "complete") {
      queueMicrotask(() => this.dispatch("icecandidate", { candidate: null }));
    }
  });
  setRemoteDescription = vi.fn(async (desc: { type: "answer"; sdp: string }) => {
    this.remoteDescription = desc;
  });

  constructor(readonly config: RTCConfiguration) {
    this.iceGatheringState = MockPeerConnection.nextIceGatheringState;
    MockPeerConnection.instances.push(this);
  }

  createDataChannel() {
    return this.createdDataChannel;
  }

  addTrack(track: MockTrack) {
    const sender = makeSender(track);
    this.senders.push(sender);
    return sender;
  }

  addTransceiver(kind: string, init?: RTCRtpTransceiverInit) {
    this.transceivers.push({ kind, init });
    const sender = makeSender(null);
    this.senders.push(sender);
    return { sender };
  }

  getSenders() {
    return this.senders;
  }

  addEventListener(type: string, listener: Listener) {
    const existing = this.listeners.get(type) ?? new Set<Listener>();
    existing.add(listener);
    this.listeners.set(type, existing);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event?: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function stubRtcGlobals() {
  vi.stubGlobal("RTCPeerConnection", MockPeerConnection as unknown as typeof RTCPeerConnection);
}

/** Standard successful SDP answer from the call proxy. */
function stubCallAnswer() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sdp: "answer-sdp" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
  );
}

function stubGetUserMedia(getUserMedia = vi.fn()) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia,
      },
    },
  });
  return getUserMedia;
}

describe("realtimeConnection", () => {
  beforeEach(() => {
    MockPeerConnection.instances = [];
    MockPeerConnection.nextIceGatheringState = "complete";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("bootstraps via the shared realtime endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          provider: "inworld",
          iceServers: [{ urls: ["stun:guide.example.com"] }],
          session: {
            type: "realtime",
            model: "test-model",
            output_modalities: ["audio", "text"],
            audio: {},
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchRealtimeBootstrap({ feature: "setup-agent", language: "sv" });

    expect(result.provider).toBe("inworld");
    expect(result.iceServers).toEqual([{ urls: ["stun:guide.example.com"] }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/realtime/bootstrap",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ feature: "setup-agent", language: "sv" }),
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("defaults missing provider to inworld and returns session defaults", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            iceServers: "invalid-shape",
            session: {
              type: "realtime",
              model: "m",
              output_modalities: ["text"],
              audio: {},
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const result = await fetchRealtimeBootstrap({ feature: "setup-agent", language: "en" });

    expect(result.provider).toBe("inworld");
    expect(result.iceServers).toEqual([]);
    expect(result.session).toMatchObject({
      type: "realtime",
      model: "m",
      output_modalities: ["text"],
    });
  });

  it("throws RealtimeHttpError when bootstrap returns a non-ok status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("denied", { status: 403 })));

    const err = await fetchRealtimeBootstrap({ feature: "setup-agent", language: "en" }).catch((e) => e);
    expect(err).toBeInstanceOf(RealtimeHttpError);
    expect((err as RealtimeHttpError).status).toBe(403);
    expect(err.message).toBe("Realtime bootstrap failed (403): denied");
  });

  it("throws a plain error when bootstrap returns an invalid session shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ provider: "inworld", iceServers: [], session: { type: "bad" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    await expect(fetchRealtimeBootstrap({ feature: "setup-agent", language: "en" })).rejects.toThrow(
      "Realtime bootstrap: response invalid"
    );
  });

  it("creates a realtime connection, forwards events, and closes cleanly", async () => {
    stubRtcGlobals();
    const audioTrack = new MockTrack("audio");
    const micStream = new MockMediaStream([audioTrack]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sdp: "answer-sdp" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const onEvent = vi.fn();
    const onRemoteTrack = vi.fn();
    const onOpen = vi.fn();
    const onClose = vi.fn();

    const connection = await createRealtimeConnection({
      session: { type: "realtime", model: "m" },
      iceServers: [{ urls: ["stun:one.example.com"] }],
      callPath: "/api/realtime/call",
      callHeaders: { Authorization: "Bearer live-key" },
      callBodyExtras: { feature: "human-input", provider: "inworld" },
      micStream: micStream as unknown as MediaStream,
      onEvent,
      onRemoteTrack,
      onOpen,
      onClose,
    });

    const pc = MockPeerConnection.instances[0];
    const dc = pc.createdDataChannel;

    expect(pc.config).toEqual({
      iceServers: [{ urls: ["stun:one.example.com"] }],
      iceCandidatePoolSize: 10,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/realtime/call",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer live-key",
        }),
        body: JSON.stringify({
          sdp: "offer-sdp",
          session: { type: "realtime", model: "m" },
          feature: "human-input",
          provider: "inworld",
        }),
        signal: expect.any(AbortSignal),
      })
    );

    dc.onopen?.();
    expect(onOpen).toHaveBeenCalledWith({ dc });

    const remoteAudioTrack = new MockTrack("audio");
    const remoteVideoTrack = new MockTrack("video");
    pc.ontrack?.({ track: remoteAudioTrack });
    pc.ontrack?.({ track: remoteVideoTrack });
    expect(onRemoteTrack).toHaveBeenCalledOnce();
    expect(onRemoteTrack).toHaveBeenCalledWith(remoteAudioTrack);

    dc.onmessage?.({ data: JSON.stringify({ type: "event.ok" }) });
    dc.onmessage?.({ data: "not-json" });
    dc.onmessage?.({ data: new Uint8Array([1, 2, 3]) });
    expect(onEvent).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith({ type: "event.ok" });

    pc.connectionState = "failed";
    pc.onconnectionstatechange?.();
    dc.onerror?.(new Error("boom"));
    dc.onclose?.();
    expect(onClose).toHaveBeenNthCalledWith(1, "pc_failed");
    expect(onClose).toHaveBeenNthCalledWith(2, "dc_error");
    expect(onClose).toHaveBeenNthCalledWith(3, "dc_close");

    connection.close();
    connection.close();
    expect(dc.close).toHaveBeenCalledTimes(1);
    expect(pc.close).toHaveBeenCalledTimes(1);
    expect(audioTrack.stop).toHaveBeenCalledTimes(2);
  });

  it("waits for ICE gathering before exchanging SDP", async () => {
    stubRtcGlobals();
    MockPeerConnection.nextIceGatheringState = "gathering";
    stubCallAnswer();

    const connection = await createRealtimeConnection({
      session: { type: "realtime" },
      iceServers: [],
      callPath: "/api/realtime/call",
      micStream: new MockMediaStream() as unknown as MediaStream,
      onEvent: vi.fn(),
      onRemoteTrack: vi.fn(),
    });

    const pc = MockPeerConnection.instances[0];
    expect(pc.setRemoteDescription).toHaveBeenCalledWith({ type: "answer", sdp: "answer-sdp" });

    connection.close();
  });

  it("refuses to connect with neither a microphone nor deferMic", async () => {
    // Acquiring one here would prompt behind the caller's back and leave the
    // availability store none the wiser.
    stubRtcGlobals();
    stubCallAnswer();

    await expect(
      createRealtimeConnection({
        session: { type: "realtime" },
        iceServers: [],
        callPath: "/api/realtime/call",
        onEvent: vi.fn(),
        onRemoteTrack: vi.fn(),
      })
    ).rejects.toThrow(/micStream/);
  });

  it("tears down partial state when call creation fails", async () => {
    stubRtcGlobals();
    const audioTrack = new MockTrack("audio");
    const micStream = new MockMediaStream([audioTrack]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("server down", { status: 500 })));

    await expect(
      createRealtimeConnection({
        session: { type: "realtime" },
        iceServers: [],
        callPath: "/api/realtime/call",
        micStream: micStream as unknown as MediaStream,
        onEvent: vi.fn(),
        onRemoteTrack: vi.fn(),
      })
    ).rejects.toThrow("Call create failed (500): server down");

    const pc = MockPeerConnection.instances[0];
    expect(pc.createdDataChannel.close).toHaveBeenCalledTimes(1);
    expect(pc.close).toHaveBeenCalledTimes(1);
    expect(audioTrack.stop).toHaveBeenCalledTimes(2);
  });

  it("connects without touching the microphone when deferMic is set", async () => {
    stubRtcGlobals();
    const getUserMedia = stubGetUserMedia(vi.fn());
    stubCallAnswer();

    const connection = await createRealtimeConnection({
      session: { type: "realtime" },
      iceServers: [],
      callPath: "/api/realtime/call",
      deferMic: true,
      onEvent: vi.fn(),
      onRemoteTrack: vi.fn(),
    });

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(connection.micStream).toBeNull();
    // An empty sendrecv m-line, so a mic can join later without renegotiating.
    expect(MockPeerConnection.instances[0].transceivers).toEqual([
      { kind: "audio", init: { direction: "sendrecv" } },
    ]);

    connection.close();
  });

  it("attaches a microphone to a deferred session without renegotiating", async () => {
    stubRtcGlobals();
    stubGetUserMedia(vi.fn());
    stubCallAnswer();

    const connection = await createRealtimeConnection({
      session: { type: "realtime" },
      iceServers: [],
      callPath: "/api/realtime/call",
      deferMic: true,
      onEvent: vi.fn(),
      onRemoteTrack: vi.fn(),
    });

    const pc = MockPeerConnection.instances[0];
    const micTrack = new MockTrack("audio");
    const micStream = new MockMediaStream([micTrack]);

    await connection.attachMic(micStream as unknown as MediaStream);

    expect(pc.senders[0].replaceTrack).toHaveBeenCalledWith(micTrack);
    expect(connection.micStream).toBe(micStream);
    // The whole point: no second offer/answer round-trip.
    expect(pc.createOffer).toHaveBeenCalledTimes(1);
    expect(pc.setRemoteDescription).toHaveBeenCalledTimes(1);

    connection.close();
  });

  it("releases the microphone on detachMic but keeps the session open", async () => {
    stubRtcGlobals();
    stubGetUserMedia(vi.fn());
    stubCallAnswer();

    const connection = await createRealtimeConnection({
      session: { type: "realtime" },
      iceServers: [],
      callPath: "/api/realtime/call",
      deferMic: true,
      onEvent: vi.fn(),
      onRemoteTrack: vi.fn(),
    });

    const pc = MockPeerConnection.instances[0];
    const micTrack = new MockTrack("audio");
    await connection.attachMic(new MockMediaStream([micTrack]) as unknown as MediaStream);

    connection.detachMic();

    expect(pc.senders[0].replaceTrack).toHaveBeenLastCalledWith(null);
    expect(micTrack.stop).toHaveBeenCalled();
    expect(connection.micStream).toBeNull();
    expect(pc.close).not.toHaveBeenCalled();

    connection.close();
  });

  it("throws AbortError before any work when the signal is already aborted", async () => {
    stubRtcGlobals();
    const controller = new AbortController();
    controller.abort();

    await expect(
      createRealtimeConnection({
        session: { type: "realtime" },
        iceServers: [],
        callPath: "/api/realtime/call",
        micStream: new MockMediaStream() as unknown as MediaStream,
        onEvent: vi.fn(),
        onRemoteTrack: vi.fn(),
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(MockPeerConnection.instances).toHaveLength(0);
  });
});

describe("classifyRealtimeError", () => {
  it("marks 4xx HTTP errors as fatal", () => {
    expect(classifyRealtimeError(new RealtimeHttpError(400, "bad"))).toBe("fatal");
    expect(classifyRealtimeError(new RealtimeHttpError(401, "unauth"))).toBe("fatal");
    expect(classifyRealtimeError(new RealtimeHttpError(403, "forbidden"))).toBe("fatal");
    expect(classifyRealtimeError(new RealtimeHttpError(404, "not found"))).toBe("fatal");
    expect(classifyRealtimeError(new RealtimeHttpError(422, "unprocessable"))).toBe("fatal");
  });

  it("marks 5xx HTTP errors as retryable", () => {
    expect(classifyRealtimeError(new RealtimeHttpError(500, "server error"))).toBe("retryable");
    expect(classifyRealtimeError(new RealtimeHttpError(503, "unavailable"))).toBe("retryable");
  });

  it("marks invalid bootstrap shape as fatal", () => {
    expect(classifyRealtimeError(new Error("Realtime bootstrap: response invalid"))).toBe("fatal");
  });

  it("marks a legacy mic NotAllowedError as unavailable on web, fatal in museum", () => {
    const err = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
    expect(classifyRealtimeError(err)).toBe("unavailable");
    expect(classifyRealtimeError(err, { unattended: false })).toBe("unavailable");
    expect(classifyRealtimeError(err, { unattended: true })).toBe("fatal");
  });

  it("marks every mic failure as unavailable on web and fatal in museum", () => {
    // Web keeps a fully clickable setup flow without a mic; a kiosk with no
    // working mic is genuinely broken and must surface as a terminal error.
    const reasons = ["insecure_context", "unsupported", "not_found", "permission_denied", "in_use", "unknown"] as const;
    for (const reason of reasons) {
      const err = new MicrophoneUnavailableError(reason, "nope");
      expect(classifyRealtimeError(err), reason).toBe("unavailable");
      expect(classifyRealtimeError(err, { unattended: false }), reason).toBe("unavailable");
      expect(classifyRealtimeError(err, { unattended: true }), reason).toBe("fatal");
    }
  });

  it("marks a request timeout as retryable", () => {
    expect(classifyRealtimeError(new RealtimeTimeoutError("timed out"))).toBe("retryable");
  });

  it("marks network and ICE errors as retryable", () => {
    expect(classifyRealtimeError(new Error("Failed to fetch"))).toBe("retryable");
    expect(classifyRealtimeError(new TypeError("Network request failed"))).toBe("retryable");
    expect(classifyRealtimeError(new Error("pc_failed"))).toBe("retryable");
  });

  it("marks unknown errors as retryable", () => {
    expect(classifyRealtimeError("something weird")).toBe("retryable");
    expect(classifyRealtimeError(null)).toBe("retryable");
    expect(classifyRealtimeError(undefined)).toBe("retryable");
  });
});

describe("realtime request timeouts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reports its own timeout as RealtimeTimeoutError, not an AbortError", async () => {
    // Regression: a slow bootstrap (e.g. the visitor left the mic permission
    // prompt open) aborts internally, and callers treat AbortError as "we
    // cancelled this" — which used to strand the session in "connecting".
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: unknown, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => {
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            });
          })
      )
    );

    const pending = fetchRealtimeBootstrap({ feature: "setup-agent", language: "en" }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(15_000);
    const err = await pending;

    expect(err).toBeInstanceOf(RealtimeTimeoutError);
    expect((err as Error).name).not.toBe("AbortError");
  });

  it("still reports a caller-driven abort as AbortError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: unknown, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => {
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            });
          })
      )
    );

    const controller = new AbortController();
    const pending = fetchRealtimeBootstrap(
      { feature: "setup-agent", language: "en" },
      controller.signal
    ).catch((e) => e);
    controller.abort();
    const err = await pending;

    expect(err).toMatchObject({ name: "AbortError" });
  });
});

describe("queryMicPermission", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports the browser's permission state", async () => {
    const states = ["granted", "prompt", "denied"] as const;
    for (const state of states) {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: { permissions: { query: vi.fn().mockResolvedValue({ state }) } },
      });
      await expect(queryMicPermission()).resolves.toBe(state);
    }
  });

  it("reports unsupported when the Permissions API can't answer", async () => {
    // Firefox rejects the `microphone` name; older browsers have no API at all.
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { permissions: { query: vi.fn().mockRejectedValue(new TypeError("bad name")) } },
    });
    await expect(queryMicPermission()).resolves.toBe("unsupported");

    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
    await expect(queryMicPermission()).resolves.toBe("unsupported");
  });
});

describe("computeRealtimeRetryDelay", () => {
  it("returns a value in [0, BASE] for attempt 0", () => {
    for (let i = 0; i < 20; i++) {
      const d = computeRealtimeRetryDelay(0);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(REALTIME_RETRY_BASE_MS);
    }
  });

  it("caps at REALTIME_RETRY_MAX_MS for large attempt numbers", () => {
    for (let i = 0; i < 20; i++) {
      const d = computeRealtimeRetryDelay(100);
      expect(d).toBeLessThanOrEqual(REALTIME_RETRY_MAX_MS);
    }
  });

  it("grows with attempt number on average", () => {
    const samples = 200;
    const avg = (attempt: number) =>
      Array.from({ length: samples }, () => computeRealtimeRetryDelay(attempt)).reduce((a, b) => a + b, 0) / samples;
    expect(avg(2)).toBeGreaterThan(avg(0));
  });
});

describe("acquireMicrophone", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("throws a MicrophoneUnavailableError when mediaDevices is unavailable", async () => {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
    const err = await acquireMicrophone().catch((e) => e);
    expect(err).toBeInstanceOf(MicrophoneUnavailableError);
    expect(["insecure_context", "unsupported"]).toContain(
      (err as MicrophoneUnavailableError).reason,
    );
  });

  it("maps getUserMedia DOMException names to a specific reason", async () => {
    const cases: Array<[string, string]> = [
      ["NotAllowedError", "permission_denied"],
      ["SecurityError", "permission_denied"],
      ["NotFoundError", "not_found"],
      ["OverconstrainedError", "not_found"],
      ["NotReadableError", "in_use"],
      ["SomethingElseError", "unknown"],
    ];
    for (const [name, reason] of cases) {
      stubGetUserMedia(
        vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name })),
      );
      const err = await acquireMicrophone().catch((e) => e);
      expect(err).toBeInstanceOf(MicrophoneUnavailableError);
      expect((err as MicrophoneUnavailableError).reason).toBe(reason);
      expect((err as MicrophoneUnavailableError).cause).toBeInstanceOf(Error);
    }
  });

  it("resolves with the stream on success", async () => {
    const stream = { id: "mic" } as unknown as MediaStream;
    stubGetUserMedia(vi.fn().mockResolvedValue(stream));
    await expect(acquireMicrophone()).resolves.toBe(stream);
  });
});
