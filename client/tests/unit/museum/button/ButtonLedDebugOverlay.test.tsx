import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ButtonLedDebugOverlay from "@/museum/button/buttonDebug";
import { _resetButtonStoreForTests, useButtonStore } from "@/museum/button/buttonStore";
import "@testing-library/jest-dom";

describe("ButtonLedDebugOverlay", () => {
  beforeEach(() => {
    _resetButtonStoreForTests();
  });

  it("renders off state", () => {
    useButtonStore.setState({ ledMode: "off", buttonOwner: null });
    render(<ButtonLedDebugOverlay />);

    const indicator = screen.getByTestId("button-led-debug-indicator");
    expect(indicator).toHaveAttribute("data-led-mode", "off");
    expect(screen.getByText("LED off")).toBeInTheDocument();
  });

  it("renders on state with owner label", () => {
    useButtonStore.setState({ ledMode: "on", buttonOwner: "meta-agent" });
    render(<ButtonLedDebugOverlay />);

    const indicator = screen.getByTestId("button-led-debug-indicator");
    expect(indicator).toHaveAttribute("data-led-mode", "on");
    expect(screen.getByText("LED on (meta-agent)")).toBeInTheDocument();
  });

  it("renders pulse state", () => {
    useButtonStore.setState({ ledMode: "pulse", buttonOwner: "setup" });
    render(<ButtonLedDebugOverlay />);

    expect(screen.getByTestId("button-led-debug-indicator")).toHaveAttribute(
      "data-led-mode",
      "pulse",
    );
  });
});
