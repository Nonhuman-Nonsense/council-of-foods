import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetButtonStoreForTests,
  resolveActiveButtonBanner,
  useButtonStore,
} from "@/museum/button/buttonStore";

const transport = vi.hoisted(() => ({
  callbacks: null as {
    onStatus?: (status: string, error?: string | null) => void;
    onSerialDeviceChange?: (connected: boolean) => void;
    onLine?: (event: { type: string }) => void;
  } | null,
  connect: vi.fn().mockResolvedValue(true),
  disconnect: vi.fn().mockResolvedValue(undefined),
  enableAutoReconnect: vi.fn(),
  setLedMode: vi.fn().mockResolvedValue(undefined),
  getStatus: vi.fn().mockReturnValue("disconnected"),
  isSessionHealthy: vi.fn().mockReturnValue(false),
  isSerialDeviceConnected: vi.fn().mockReturnValue(true),
}));

vi.mock("@/museum/button/buttonBridge", () => ({
  isButtonBridgeAvailable: () => true,
  ButtonTransport: class MockButtonTransport {
    constructor(callbacks: {
      onStatus?: (status: string, error?: string | null) => void;
      onSerialDeviceChange?: (connected: boolean) => void;
      onLine?: (event: { type: string }) => void;
    }) {
      transport.callbacks = callbacks;
    }

    connect = transport.connect;
    disconnect = transport.disconnect;
    enableAutoReconnect = transport.enableAutoReconnect;
    setLedMode = transport.setLedMode;
    getStatus = transport.getStatus;
    isSessionHealthy = transport.isSessionHealthy;
    isSerialDeviceConnected = transport.isSerialDeviceConnected;
  },
}));

describe("useButtonStore", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    // Pin to museum: this suite is about ownership/transport mechanics, not
    // gesture semantics, and museum's plain hold-only behaviour keeps a quick
    // synchronous press/release in these tests from being read as a tap.
    localStorage.setItem("councilAppMode", "museum");
    _resetButtonStoreForTests();
    useButtonStore.getState().init();
    await useButtonStore.getState().connect();
  });

  afterEach(() => {
    _resetButtonStoreForTests();
  });

  it("ignores input while disarmed", () => {
    useButtonStore.setState({ armed: false, bridgeStatus: "connected" });
    transport.callbacks?.onLine?.({ type: "button_down" });
    expect(useButtonStore.getState().hardwareDown).toBe(true);
    expect(useButtonStore.getState().pressed).toBe(false);
  });

  it("sets pressed when armed and the button goes down", () => {
    useButtonStore.setState({ armed: true, bridgeStatus: "connected" });
    transport.callbacks?.onLine?.({ type: "button_down" });
    expect(useButtonStore.getState().pressed).toBe(true);
    transport.callbacks?.onLine?.({ type: "button_up" });
    expect(useButtonStore.getState().pressed).toBe(false);
  });

  it("activates a held space the moment the owner arms", async () => {
    useButtonStore.setState({
      keyboardDown: true,
      bridgeStatus: "connected",
    });
    useButtonStore.getState().claimButton("human-input");
    useButtonStore.getState().setButtonArmed("human-input", false);
    await Promise.resolve();
    expect(useButtonStore.getState().pressed).toBe(false);

    useButtonStore.getState().setButtonArmed("human-input", true);
    await Promise.resolve();
    expect(useButtonStore.getState().pressed).toBe(true);
  });

  it("routes to the owner and lights the LED on claim + arm", async () => {
    useButtonStore.setState({ bridgeStatus: "connected" });
    useButtonStore.getState().claimButton("human-input");
    useButtonStore.getState().setButtonArmed("human-input", true);
    await Promise.resolve();
    expect(useButtonStore.getState().buttonOwner).toBe("human-input");
    expect(useButtonStore.getState().ledMode).toBe("pulse");
    expect(transport.setLedMode).toHaveBeenCalledWith("pulse");
  });

  it("routes press to the winning owner", async () => {
    useButtonStore.setState({ bridgeStatus: "connected" });
    useButtonStore.getState().claimButton("meta-agent");
    useButtonStore.getState().setButtonArmed("meta-agent", true);
    useButtonStore.getState().claimButton("human-input");
    useButtonStore.getState().setButtonArmed("human-input", true);
    await Promise.resolve();
    expect(useButtonStore.getState().buttonOwner).toBe("human-input");
    transport.callbacks?.onLine?.({ type: "button_down" });
    expect(useButtonStore.getState().pressed).toBe(true);
    useButtonStore.getState().releaseButton("human-input");
    expect(useButtonStore.getState().buttonOwner).toBe("meta-agent");
  });

  it("keeps ownership while disarmed, with the LED dark", async () => {
    useButtonStore.setState({ bridgeStatus: "connected" });
    useButtonStore.getState().claimButton("meta-agent");
    useButtonStore.getState().setButtonArmed("meta-agent", false);
    await Promise.resolve();
    expect(useButtonStore.getState().buttonOwner).toBe("meta-agent");
    expect(useButtonStore.getState().ledMode).toBe("off");
  });

  it("autoplay wins over setup-agent when both claim", async () => {
    useButtonStore.setState({ bridgeStatus: "connected" });
    useButtonStore.getState().claimButton("setup-agent");
    useButtonStore.getState().setButtonArmed("setup-agent", true);
    useButtonStore.getState().claimButton("autoplay");
    useButtonStore.getState().setButtonArmed("autoplay", true);
    await Promise.resolve();
    expect(useButtonStore.getState().buttonOwner).toBe("autoplay");
  });

  it("staff wins over autoplay when both claim", async () => {
    useButtonStore.setState({ bridgeStatus: "connected" });
    useButtonStore.getState().claimButton("autoplay");
    useButtonStore.getState().setButtonArmed("autoplay", true);
    useButtonStore.getState().claimButton("staff");
    useButtonStore.getState().setButtonArmed("staff", true);
    await Promise.resolve();
    expect(useButtonStore.getState().buttonOwner).toBe("staff");
  });

  it("staff wins over human-input when both claim", async () => {
    useButtonStore.setState({ bridgeStatus: "connected" });
    useButtonStore.getState().claimButton("human-input");
    useButtonStore.getState().setButtonArmed("human-input", true);
    useButtonStore.getState().claimButton("staff");
    useButtonStore.getState().setButtonArmed("staff", true);
    await Promise.resolve();
    expect(useButtonStore.getState().buttonOwner).toBe("staff");
    expect(useButtonStore.getState().ledMode).toBe("pulse");
    expect(transport.setLedMode).toHaveBeenLastCalledWith("pulse");
  });

  it("falls back to the next owner's armed state when staff releases", async () => {
    useButtonStore.setState({ bridgeStatus: "connected" });
    useButtonStore.getState().claimButton("human-input");
    useButtonStore.getState().setButtonArmed("human-input", true);
    useButtonStore.getState().claimButton("staff");
    useButtonStore.getState().setButtonArmed("staff", true);
    useButtonStore.getState().releaseButton("staff");
    await Promise.resolve();
    expect(useButtonStore.getState().buttonOwner).toBe("human-input");
    expect(useButtonStore.getState().ledMode).toBe("pulse");
    expect(transport.setLedMode).toHaveBeenLastCalledWith("pulse");
  });

  it("clears hardware press when bridge disconnects but keeps keyboard press", () => {
    useButtonStore.setState({
      pressed: true,
      keyboardDown: true,
      hardwareDown: true,
      armed: true,
      bridgeStatus: "connected",
    });
    transport.callbacks?.onStatus?.("disconnected");
    expect(useButtonStore.getState().hardwareDown).toBe(false);
    expect(useButtonStore.getState().keyboardDown).toBe(true);
    expect(useButtonStore.getState().pressed).toBe(true);
  });

  it("clears hardware-only press when bridge disconnects", () => {
    useButtonStore.setState({
      pressed: true,
      hardwareDown: true,
      keyboardDown: false,
      armed: true,
      bridgeStatus: "connected",
    });
    transport.callbacks?.onStatus?.("disconnected");
    expect(useButtonStore.getState().pressed).toBe(false);
    expect(useButtonStore.getState().hardwareDown).toBe(false);
  });

  it("connects through transport", async () => {
    await useButtonStore.getState().connect();
    expect(transport.connect).toHaveBeenCalled();
  });

  it("does not send LED commands when usb serial is disconnected", async () => {
    transport.isSerialDeviceConnected.mockReturnValue(false);
    useButtonStore.setState({ bridgeStatus: "connected", serialDeviceConnected: false });
    useButtonStore.getState().claimButton("human-input");
    useButtonStore.getState().setButtonArmed("human-input", true);
    await Promise.resolve();
    expect(useButtonStore.getState().ledMode).toBe("pulse");
    expect(transport.setLedMode).not.toHaveBeenCalled();
  });

  it("resyncs LED when usb serial connects", async () => {
    useButtonStore.setState({
      bridgeStatus: "connected",
      ledMode: "pulse",
      serialDeviceConnected: false,
    });
    transport.isSerialDeviceConnected.mockReturnValue(true);
    transport.setLedMode.mockClear();

    transport.callbacks?.onSerialDeviceChange?.(true);

    await Promise.resolve();
    expect(useButtonStore.getState().serialDeviceConnected).toBe(true);
    expect(transport.setLedMode).toHaveBeenCalledWith("pulse");
  });

  it("clears hardware press when usb serial disconnects", () => {
    useButtonStore.setState({
      pressed: true,
      hardwareDown: true,
      keyboardDown: false,
      armed: true,
      bridgeStatus: "connected",
      serialDeviceConnected: true,
    });
    transport.callbacks?.onSerialDeviceChange?.(false);
    expect(useButtonStore.getState().pressed).toBe(false);
    expect(useButtonStore.getState().hardwareDown).toBe(false);
    expect(useButtonStore.getState().serialDeviceConnected).toBe(false);
  });

  it("applies button_up sync after reconnect when input was stale", () => {
    useButtonStore.setState({
      pressed: true,
      hardwareDown: true,
      armed: true,
      bridgeStatus: "connected",
      serialDeviceConnected: true,
    });
    transport.callbacks?.onSerialDeviceChange?.(false);
    transport.callbacks?.onLine?.({ type: "button_up" });
    expect(useButtonStore.getState().hardwareDown).toBe(false);
    expect(useButtonStore.getState().pressed).toBe(false);
  });

  it("tracks button_down sync after reconnect when button is held", () => {
    useButtonStore.setState({
      bridgeStatus: "connected",
      serialDeviceConnected: true,
      buttonOwner: "human-input",
      armed: true,
    });
    transport.callbacks?.onLine?.({ type: "button_down" });
    expect(useButtonStore.getState().hardwareDown).toBe(true);
    expect(useButtonStore.getState().pressed).toBe(true);
  });

  it("does not carry pressed state to the next owner while input is held", async () => {
    useButtonStore.setState({ bridgeStatus: "connected" });
    useButtonStore.getState().claimButton("autoplay");
    useButtonStore.getState().setButtonArmed("autoplay", true);
    useButtonStore.getState().claimButton("meta-agent");
    useButtonStore.getState().setButtonArmed("meta-agent", true);
    await Promise.resolve();

    transport.callbacks?.onLine?.({ type: "button_down" });
    expect(useButtonStore.getState().buttonOwner).toBe("autoplay");
    expect(useButtonStore.getState().pressed).toBe(true);

    useButtonStore.getState().releaseButton("autoplay");
    await Promise.resolve();

    expect(useButtonStore.getState().buttonOwner).toBe("meta-agent");
    expect(useButtonStore.getState().hardwareDown).toBe(true);
    expect(useButtonStore.getState().pressed).toBe(false);
    expect(useButtonStore.getState().ignoreDownUntilRelease).toBe(true);
  });

  it("accepts a fresh press from the new owner after release", async () => {
    useButtonStore.setState({ bridgeStatus: "connected" });
    useButtonStore.getState().claimButton("autoplay");
    useButtonStore.getState().setButtonArmed("autoplay", true);
    useButtonStore.getState().claimButton("meta-agent");
    useButtonStore.getState().setButtonArmed("meta-agent", true);
    await Promise.resolve();

    transport.callbacks?.onLine?.({ type: "button_down" });
    useButtonStore.getState().releaseButton("autoplay");
    await Promise.resolve();
    expect(useButtonStore.getState().pressed).toBe(false);

    transport.callbacks?.onLine?.({ type: "button_up" });
    expect(useButtonStore.getState().ignoreDownUntilRelease).toBe(false);

    transport.callbacks?.onLine?.({ type: "button_down" });
    expect(useButtonStore.getState().buttonOwner).toBe("meta-agent");
    expect(useButtonStore.getState().pressed).toBe(true);
  });

  it("autoplay wins over meta-agent when both claim", async () => {
    useButtonStore.setState({ bridgeStatus: "connected" });
    useButtonStore.getState().claimButton("meta-agent");
    useButtonStore.getState().setButtonArmed("meta-agent", true);
    useButtonStore.getState().claimButton("autoplay");
    useButtonStore.getState().setButtonArmed("autoplay", true);
    await Promise.resolve();
    expect(useButtonStore.getState().buttonOwner).toBe("autoplay");
  });

  describe("ButtonBanner visibility", () => {
    it("shows banner only for the routed owner", () => {
      useButtonStore.getState().claimButton("meta-agent");
      useButtonStore.getState().claimButton("human-input");
      useButtonStore.getState().setButtonBannerVisible("meta-agent", true);
      useButtonStore.getState().setButtonBannerVisible("human-input", false);

      expect(useButtonStore.getState().activeButtonBanner).toBe(false);

      useButtonStore.getState().setButtonBannerVisible("human-input", true);
      expect(useButtonStore.getState().activeButtonBanner).toBe(true);
    });

    it("prefers human-input banner over meta-agent when human-input owns the button", () => {
      useButtonStore.getState().claimButton("meta-agent");
      useButtonStore.getState().claimButton("human-input");
      useButtonStore.getState().setButtonBannerVisible("meta-agent", true);
      useButtonStore.getState().setButtonBannerVisible("human-input", true);

      expect(useButtonStore.getState().buttonOwner).toBe("human-input");
      expect(useButtonStore.getState().activeButtonBanner).toBe(true);
    });

    it("clears banner visibility when the owner releases the button claim", () => {
      useButtonStore.getState().claimButton("human-input");
      useButtonStore.getState().setButtonBannerVisible("human-input", true);
      expect(useButtonStore.getState().activeButtonBanner).toBe(true);

      useButtonStore.getState().releaseButton("human-input");
      expect(useButtonStore.getState().bannerVisible["human-input"]).toBeUndefined();
      expect(useButtonStore.getState().activeButtonBanner).toBe(false);
    });

    it("resolveActiveButtonBanner returns false without an owner", () => {
      expect(resolveActiveButtonBanner(null, { "human-input": true })).toBe(false);
    });
  });

  describe("tap/hold gesture", () => {
    function pressFor(ms: number): void {
      useButtonStore.setState({ keyboardDown: true });
      useButtonStore.getState().syncPressed("keyboard");
      vi.advanceTimersByTime(ms);
      useButtonStore.setState({ keyboardDown: false });
      useButtonStore.getState().syncPressed("keyboard");
    }

    beforeEach(() => {
      vi.useFakeTimers();
      useButtonStore.getState().claimButton("setup-agent");
      useButtonStore.getState().setButtonArmed("setup-agent", true);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("museum: a quick press never latches — releasing always closes", () => {
      pressFor(50);
      expect(useButtonStore.getState().pressed).toBe(false);
      expect(useButtonStore.getState().latched).toBe(false);
    });

    it("web: a tap under the threshold latches on, and stays on after release", () => {
      localStorage.setItem("councilAppMode", "web");

      pressFor(50);

      expect(useButtonStore.getState().pressed).toBe(false);
      expect(useButtonStore.getState().latched).toBe(true);
    });

    it("web: a second tap unlatches", () => {
      localStorage.setItem("councilAppMode", "web");

      pressFor(50);
      expect(useButtonStore.getState().latched).toBe(true);
      pressFor(50);
      expect(useButtonStore.getState().latched).toBe(false);
    });

    it("web: a hold opens the mic while held and closes fully on release", () => {
      localStorage.setItem("councilAppMode", "web");

      useButtonStore.setState({ keyboardDown: true });
      useButtonStore.getState().syncPressed("keyboard");
      vi.advanceTimersByTime(300);
      expect(useButtonStore.getState().pressed).toBe(true);
      expect(useButtonStore.getState().latched).toBe(false);

      useButtonStore.setState({ keyboardDown: false });
      useButtonStore.getState().syncPressed("keyboard");
      expect(useButtonStore.getState().pressed).toBe(false);
      expect(useButtonStore.getState().latched).toBe(false);
    });

    it("web: holding while latched on forces it closed, as an explicit close gesture", () => {
      localStorage.setItem("councilAppMode", "web");

      pressFor(50);
      expect(useButtonStore.getState().latched).toBe(true);

      pressFor(300);
      expect(useButtonStore.getState().latched).toBe(false);
    });

    it("web: an on-screen click toggles the same latch as a tap", () => {
      localStorage.setItem("councilAppMode", "web");

      useButtonStore.getState().toggleButtonLatch("setup-agent");
      expect(useButtonStore.getState().latched).toBe(true);

      useButtonStore.getState().toggleButtonLatch("setup-agent");
      expect(useButtonStore.getState().latched).toBe(false);
    });

    it("ignores a latch toggle from an owner that does not hold the button", () => {
      localStorage.setItem("councilAppMode", "web");

      useButtonStore.getState().toggleButtonLatch("summary");

      expect(useButtonStore.getState().latched).toBe(false);
    });

    it("treats losing window focus as a release", () => {
      // The first web press opens the microphone permission prompt, which can
      // take focus and swallow the keyup — leaving the mic open with nothing
      // holding it.
      localStorage.setItem("councilAppMode", "museum");

      useButtonStore.setState({ keyboardDown: true });
      useButtonStore.getState().syncPressed("keyboard");
      expect(useButtonStore.getState().pressed).toBe(true);

      window.dispatchEvent(new Event("blur"));

      expect(useButtonStore.getState().keyboardDown).toBe(false);
      expect(useButtonStore.getState().pressed).toBe(false);
    });

    it("web: losing window focus clears a latched-open mic — a real withdrawal, not a wait", () => {
      // Unlike a disarm, this must not come back by itself: leaving the mic
      // open while the visitor is on another tab or app is a privacy
      // surprise, not a capability they'll regain.
      localStorage.setItem("councilAppMode", "web");

      pressFor(50);
      expect(useButtonStore.getState().latched).toBe(true);

      window.dispatchEvent(new Event("blur"));

      expect(useButtonStore.getState().latched).toBe(false);

      // And it stays withdrawn through a disarm/re-arm — it is not merely
      // suspended the way a capability loss would be.
      useButtonStore.getState().setButtonArmed("setup-agent", false);
      useButtonStore.getState().setButtonArmed("setup-agent", true);
      expect(useButtonStore.getState().latched).toBe(false);
    });

    it("does not clear an unlatched session on blur", () => {
      localStorage.setItem("councilAppMode", "web");

      window.dispatchEvent(new Event("blur"));

      expect(useButtonStore.getState().latched).toBe(false);
    });

    it("lets an owner end a latch it did not start", () => {
      // Human input finishes a take when the visitor turns to the textarea; the
      // state can settle back to armed in one batch, so the disarm path alone
      // would never fire and the mic would re-open.
      localStorage.setItem("councilAppMode", "web");

      pressFor(50);
      expect(useButtonStore.getState().latched).toBe(true);

      useButtonStore.getState().clearButtonLatch("setup-agent");
      expect(useButtonStore.getState().latched).toBe(false);
    });

    it("keeps a latch through a disarm and honours it again on re-arm", () => {
      // Arming is a capability, not consent: losing it for a moment — a
      // reconnect, or waiting for the agent to be ready to listen — must not
      // throw away what the visitor asked for. The mic still closes meanwhile,
      // because `wantsMic` requires `armed`.
      localStorage.setItem("councilAppMode", "web");

      pressFor(50);
      expect(useButtonStore.getState().latched).toBe(true);

      useButtonStore.getState().setButtonArmed("setup-agent", false);
      expect(useButtonStore.getState().latched).toBe(true);
      expect(useButtonStore.getState().armed).toBe(false);

      useButtonStore.getState().setButtonArmed("setup-agent", true);
      expect(useButtonStore.getState().latched).toBe(true);
      expect(useButtonStore.getState().armed).toBe(true);
    });

    it("does not read a disarm as a tap when the visitor is mid-press", () => {
      // The disarm ends the press, but it is not a gesture — measuring it as
      // one would toggle the latch on the visitor's behalf.
      localStorage.setItem("councilAppMode", "web");

      useButtonStore.setState({ keyboardDown: true });
      useButtonStore.getState().syncPressed("keyboard");
      expect(useButtonStore.getState().pressed).toBe(true);

      useButtonStore.getState().setButtonArmed("setup-agent", false);

      expect(useButtonStore.getState().latched).toBe(false);
    });

    it("owner handoff clears a latch — the next owner starts clean", () => {
      localStorage.setItem("councilAppMode", "web");

      pressFor(50);
      expect(useButtonStore.getState().latched).toBe(true);

      useButtonStore.getState().claimButton("staff");
      useButtonStore.getState().setButtonArmed("staff", true);
      expect(useButtonStore.getState().buttonOwner).toBe("staff");
      expect(useButtonStore.getState().latched).toBe(false);
    });

    it.each([
      ["bridge connection drops", () => transport.callbacks?.onStatus?.("disconnected")],
      ["usb serial disconnects", () => transport.callbacks?.onSerialDeviceChange?.(false)],
    ])(
      "does not read a %s mid-press as a tap release",
      (_label, dropConnection) => {
        // A connection loss ends the physical hold, but it is not a gesture —
        // measuring it as one would spuriously latch the mic open on the
        // visitor's behalf and leave the LED reading "on" for no one.
        localStorage.setItem("councilAppMode", "web");
        useButtonStore.setState({ bridgeStatus: "connected", serialDeviceConnected: true });

        transport.callbacks?.onLine?.({ type: "button_down" });
        expect(useButtonStore.getState().pressed).toBe(true);

        dropConnection();

        expect(useButtonStore.getState().pressed).toBe(false);
        expect(useButtonStore.getState().latched).toBe(false);
        expect(useButtonStore.getState().ledMode).toBe("pulse");
      },
    );
  });
});
