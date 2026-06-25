import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ButtonLedDebugOverlay from "@/museum/button/buttonDebug";
import { _resetButtonStoreForTests, useButtonStore } from "@/museum/button/buttonStore";
import "@testing-library/jest-dom";

describe("ButtonLedDebugOverlay", () => {
  beforeEach(() => {
    _resetButtonStoreForTests();
  });

  it("renders off state with no owner", () => {
    useButtonStore.setState({ ledMode: "off", buttonOwner: null });
    render(<ButtonLedDebugOverlay />);

    const indicator = screen.getByTestId("button-led-debug-indicator");
    expect(indicator).toHaveAttribute("data-led-mode", "off");
    expect(screen.getByTestId("button-led-debug-owner")).toHaveTextContent("—");
    expect(screen.queryByTestId("button-led-debug-state")).not.toBeInTheDocument();
  });

  it("renders on state with owner label", () => {
    useButtonStore.setState({ ledMode: "on", buttonOwner: "meta-agent" });
    render(<ButtonLedDebugOverlay />);

    const indicator = screen.getByTestId("button-led-debug-indicator");
    expect(indicator).toHaveAttribute("data-led-mode", "on");
    expect(screen.getByTestId("button-led-debug-owner")).toHaveTextContent("Meta agent");
  });

  it("renders pulse state", () => {
    useButtonStore.setState({ ledMode: "pulse", buttonOwner: "setup" });
    render(<ButtonLedDebugOverlay />);

    expect(screen.getByTestId("button-led-debug-indicator")).toHaveAttribute(
      "data-led-mode",
      "pulse",
    );
    expect(screen.getByTestId("button-led-debug-owner")).toHaveTextContent("Setup");
  });

  it("is fixed to the bottom-right corner", () => {
    useButtonStore.setState({ ledMode: "off", buttonOwner: null });
    render(<ButtonLedDebugOverlay />);

    const overlay = screen.getByTestId("button-led-debug-overlay");
    expect(overlay).toHaveStyle({
      position: "fixed",
      bottom: "8px",
      right: "15px",
    });
  });
});
