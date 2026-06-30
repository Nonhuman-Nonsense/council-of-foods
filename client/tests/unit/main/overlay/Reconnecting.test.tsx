import { describe, it, expect, beforeEach } from "vitest";
import { act } from "@testing-library/react";
import { useErrorStore } from "@main/overlay/errorStore";

describe("errorStore — connection error tracking", () => {
  beforeEach(() => {
    useErrorStore.getState().resetForTests();
  });

  it("starts with no error", () => {
    expect(useErrorStore.getState().connectionError).toBe(false);
  });

  it("reports error when a source is activated", () => {
    act(() => useErrorStore.getState().setConnectionError("socket", true));
    expect(useErrorStore.getState().connectionError).toBe(true);
  });

  it("clears error when the source is deactivated", () => {
    act(() => useErrorStore.getState().setConnectionError("socket", true));
    act(() => useErrorStore.getState().setConnectionError("socket", false));
    expect(useErrorStore.getState().connectionError).toBe(false);
  });

  it("remains in error if any source is still active", () => {
    act(() => useErrorStore.getState().setConnectionError("socket", true));
    act(() => useErrorStore.getState().setConnectionError("voice-guide", true));
    act(() => useErrorStore.getState().setConnectionError("socket", false));
    expect(useErrorStore.getState().connectionError).toBe(true);
  });

  it("clears when all sources are deactivated", () => {
    act(() => useErrorStore.getState().setConnectionError("socket", true));
    act(() => useErrorStore.getState().setConnectionError("meta-agent", true));
    act(() => useErrorStore.getState().setConnectionError("socket", false));
    act(() => useErrorStore.getState().setConnectionError("meta-agent", false));
    expect(useErrorStore.getState().connectionError).toBe(false);
  });

  it("deactivating an already-inactive source is a no-op", () => {
    act(() => useErrorStore.getState().setConnectionError("socket", false));
    expect(useErrorStore.getState().connectionError).toBe(false);
  });

  it("activating the same source twice does not require two deactivations", () => {
    act(() => useErrorStore.getState().setConnectionError("socket", true));
    act(() => useErrorStore.getState().setConnectionError("socket", true));
    act(() => useErrorStore.getState().setConnectionError("socket", false));
    expect(useErrorStore.getState().connectionError).toBe(false);
  });
});
