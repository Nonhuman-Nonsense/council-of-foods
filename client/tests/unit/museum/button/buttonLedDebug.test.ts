import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  BUTTON_LED_DEBUG_CHANGE_EVENT,
  BUTTON_LED_DEBUG_STORAGE_KEY,
  getButtonLedDebugOverlay,
  setButtonLedDebugOverlay,
} from "@/museum/button/buttonLedDebug";

describe("buttonLedDebug", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to false", () => {
    expect(getButtonLedDebugOverlay()).toBe(false);
  });

  it("persists in localStorage", () => {
    setButtonLedDebugOverlay(true);
    expect(localStorage.getItem(BUTTON_LED_DEBUG_STORAGE_KEY)).toBe("true");
    expect(getButtonLedDebugOverlay()).toBe(true);

    setButtonLedDebugOverlay(false);
    expect(localStorage.getItem(BUTTON_LED_DEBUG_STORAGE_KEY)).toBe("false");
    expect(getButtonLedDebugOverlay()).toBe(false);
  });

  it("dispatches a change event when updated", () => {
    const handler = vi.fn();
    window.addEventListener(BUTTON_LED_DEBUG_CHANGE_EVENT, handler);

    setButtonLedDebugOverlay(true);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ detail: true }));

    window.removeEventListener(BUTTON_LED_DEBUG_CHANGE_EVENT, handler);
  });
});
