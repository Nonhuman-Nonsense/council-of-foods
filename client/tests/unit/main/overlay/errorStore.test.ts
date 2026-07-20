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
    act(() => useErrorStore.getState().setConnectionError("setup-agent", true));
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

  it("activating the same source twice only needs one deactivation to clear", () => {
    act(() => useErrorStore.getState().setConnectionError("socket", true));
    act(() => useErrorStore.getState().setConnectionError("socket", true));
    act(() => useErrorStore.getState().setConnectionError("socket", false));
    expect(useErrorStore.getState().connectionError).toBe(false);
  });
});

describe("errorStore — unrecoverable error tracking", () => {
  beforeEach(() => {
    useErrorStore.getState().resetForTests();
  });

  it("starts null", () => {
    expect(useErrorStore.getState().unrecoverableError).toBeNull();
  });

  it("sets an error object", () => {
    act(() =>
      useErrorStore.getState().setUnrecoverableError({
        message: "boom",
        source: "test",
      }),
    );
    expect(useErrorStore.getState().unrecoverableError).toMatchObject({
      message: "boom",
      source: "test",
    });
  });

  it("normalises a plain string to { message, source: 'client' }", () => {
    act(() => useErrorStore.getState().setUnrecoverableError("plain message"));
    expect(useErrorStore.getState().unrecoverableError).toMatchObject({
      message: "plain message",
      source: "client",
    });
  });

  it("clears the error when null is passed", () => {
    act(() => useErrorStore.getState().setUnrecoverableError("boom"));
    act(() => useErrorStore.getState().setUnrecoverableError(null));
    expect(useErrorStore.getState().unrecoverableError).toBeNull();
  });

  it("resetForTests clears both error states", () => {
    act(() => {
      useErrorStore.getState().setConnectionError("socket", true);
      useErrorStore.getState().setUnrecoverableError("boom");
    });
    act(() => useErrorStore.getState().resetForTests());
    expect(useErrorStore.getState().connectionError).toBe(false);
    expect(useErrorStore.getState().unrecoverableError).toBeNull();
  });
});
