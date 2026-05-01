import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  createRealtimeConnection,
  fetchRealtimeBootstrap,
  fetchRealtimeSessionDefaults,
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

class MockPeerConnection {
  static instances: MockPeerConnection[] = [];
  static nextIceGatheringState: "new" | "gathering" | "complete" = "complete";

  readonly createdDataChannel = new MockDataChannel();
  readonly senders: Array<{ track: MockTrack }> = [];
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
    this.senders.push({ track });
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

    const result = await fetchRealtimeBootstrap({ feature: "voice-guide" });

    expect(result.provider).toBe("inworld");
    expect(result.iceServers).toEqual([{ urls: ["stun:guide.example.com"] }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/realtime/bootstrap",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ feature: "voice-guide" }),
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

    const result = await fetchRealtimeSessionDefaults({ feature: "voice-guide" });

    expect(result).toMatchObject({
      type: "realtime",
      model: "m",
      output_modalities: ["text"],
    });
  });

  it("throws when bootstrap fails or returns an invalid session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("denied", { status: 403 })));

    await expect(fetchRealtimeBootstrap({ feature: "voice-guide" })).rejects.toThrow(
      "Realtime bootstrap failed (403): denied"
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ provider: "inworld", iceServers: [], session: { type: "bad" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    await expect(fetchRealtimeBootstrap({ feature: "voice-guide" })).rejects.toThrow(
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

  it("waits for ICE gathering, can use getUserMedia, and sets the remote description", async () => {
    stubRtcGlobals();
    MockPeerConnection.nextIceGatheringState = "gathering";
    const micTrack = new MockTrack("audio");
    const getUserMedia = stubGetUserMedia(
      vi.fn().mockResolvedValue(new MockMediaStream([micTrack]) as unknown as MediaStream)
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ sdp: "answer-sdp" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const connectionPromise = createRealtimeConnection({
      session: { type: "realtime" },
      iceServers: [],
      callPath: "/api/realtime/call",
      onEvent: vi.fn(),
      onRemoteTrack: vi.fn(),
    });

    const connection = await connectionPromise;
    const pc = MockPeerConnection.instances[0];

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    expect(pc.setRemoteDescription).toHaveBeenCalledWith({ type: "answer", sdp: "answer-sdp" });

    connection.close();
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
