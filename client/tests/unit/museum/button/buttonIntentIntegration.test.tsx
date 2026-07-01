import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { useButton } from "@/museum/button/useButton";
import { _resetButtonStoreForTests, useButtonStore } from "@/museum/button/buttonStore";

const transport = vi.hoisted(() => ({
  setLedMode: vi.fn().mockResolvedValue(undefined),
  isSerialDeviceConnected: vi.fn().mockReturnValue(true),
}));

vi.mock("@/museum/button/buttonBridge", () => ({
  isButtonBridgeAvailable: () => true,
  ButtonTransport: class MockButtonTransport {
    setLedMode = transport.setLedMode;
    isSerialDeviceConnected = transport.isSerialDeviceConnected;
    connect = vi.fn();
    disconnect = vi.fn();
    enableAutoReconnect = vi.fn();
    isSessionHealthy = vi.fn();
  },
}));

type Phase = "off" | "warm" | "active";

/** Mirrors Council: HumanInput before MeetingMetaAgent; priority resolves overlap. */
function CouncilButtonClaims({ phase }: { phase: Phase }) {
  const humanInput = useButton("human-input");
  const metaAgent = useButton("meta-agent");
  const humanInputActive = phase === "active";
  const {
    claim: claimHuman,
    release: releaseHuman,
    setLed: setHumanLed,
  } = humanInput;
  const { claim: claimMeta, release: releaseMeta, setLed: setMetaLed } = metaAgent;

  useEffect(() => {
    if (!humanInputActive) return;
    claimHuman();
    setHumanLed("pulse");
    return () => releaseHuman();
  }, [claimHuman, releaseHuman, setHumanLed, humanInputActive]);

  useEffect(() => {
    claimMeta();
    setMetaLed("pulse");
    return () => releaseMeta();
  }, [claimMeta, releaseMeta, setMetaLed]);

  return null;
}

describe("button claim integration (Council order)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetButtonStoreForTests();
    useButtonStore.setState({ bridgeStatus: "connected", serialDeviceConnected: true });
  });

  afterEach(() => {
    _resetButtonStoreForTests();
  });

  it("routes press to human-input when both claim during active phase", () => {
    render(<CouncilButtonClaims phase="active" />);

    expect(useButtonStore.getState().buttonOwner).toBe("human-input");

    act(() => {
      useButtonStore.setState({ hardwareDown: true, ledMode: "pulse" });
      useButtonStore.getState().syncPressed("button");
    });

    expect(useButtonStore.getState().buttonOwner).toBe("human-input");
    expect(useButtonStore.getState().pressed).toBe(true);
  });

  it("routes press to meta-agent during warm when only meta-agent competes", () => {
    render(<CouncilButtonClaims phase="warm" />);

    expect(useButtonStore.getState().buttonOwner).toBe("meta-agent");
  });

  it("hands press routing to human-input after warm → active transition", () => {
    const { rerender } = render(<CouncilButtonClaims phase="warm" />);
    expect(useButtonStore.getState().buttonOwner).toBe("meta-agent");

    rerender(<CouncilButtonClaims phase="active" />);
    expect(useButtonStore.getState().buttonOwner).toBe("human-input");
  });

  it("does not carry press to human-input when warm → active while button is held", () => {
    const { rerender } = render(<CouncilButtonClaims phase="warm" />);

    act(() => {
      useButtonStore.setState({ hardwareDown: true, ledMode: "pulse" });
      useButtonStore.getState().syncPressed("button");
    });
    expect(useButtonStore.getState().buttonOwner).toBe("meta-agent");
    expect(useButtonStore.getState().pressed).toBe(true);

    rerender(<CouncilButtonClaims phase="active" />);

    expect(useButtonStore.getState().buttonOwner).toBe("human-input");
    expect(useButtonStore.getState().pressed).toBe(false);
    expect(useButtonStore.getState().ignoreDownUntilRelease).toBe(true);
  });

  it("routes a fresh press to human-input after warm → active handoff", () => {
    const { rerender } = render(<CouncilButtonClaims phase="warm" />);

    act(() => {
      useButtonStore.setState({ hardwareDown: true, ledMode: "pulse" });
      useButtonStore.getState().syncPressed("button");
    });

    rerender(<CouncilButtonClaims phase="active" />);
    expect(useButtonStore.getState().pressed).toBe(false);

    act(() => {
      useButtonStore.setState({ hardwareDown: false });
      useButtonStore.getState().syncPressed("button");
      useButtonStore.setState({ hardwareDown: true });
      useButtonStore.getState().syncPressed("button");
    });

    expect(useButtonStore.getState().buttonOwner).toBe("human-input");
    expect(useButtonStore.getState().pressed).toBe(true);
  });
});
