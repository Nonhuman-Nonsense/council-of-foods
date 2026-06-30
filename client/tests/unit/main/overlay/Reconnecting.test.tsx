import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConnectionError } from "@main/overlay/Reconnecting";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock("@/utils", () => ({ useMobile: () => false }));
vi.mock("@/routing", () => ({ useRouting: () => ({ rootPath: "/" }) }));
vi.mock("@/settings/councilSettings", () => ({
  useCouncilSettings: () => ({ isMuseumMode: false }),
}));

describe("useConnectionError", () => {
  it("starts with no error", () => {
    const { result } = renderHook(() => useConnectionError());
    expect(result.current.connectionError).toBe(false);
  });

  it("reports error when a source is activated", () => {
    const { result } = renderHook(() => useConnectionError());
    act(() => result.current.setConnectionError("socket", true));
    expect(result.current.connectionError).toBe(true);
  });

  it("clears error when the source is deactivated", () => {
    const { result } = renderHook(() => useConnectionError());
    act(() => result.current.setConnectionError("socket", true));
    act(() => result.current.setConnectionError("socket", false));
    expect(result.current.connectionError).toBe(false);
  });

  it("remains in error if any source is still active", () => {
    const { result } = renderHook(() => useConnectionError());
    act(() => result.current.setConnectionError("socket", true));
    act(() => result.current.setConnectionError("voice-guide", true));
    act(() => result.current.setConnectionError("socket", false));
    expect(result.current.connectionError).toBe(true);
  });

  it("clears when all sources are deactivated", () => {
    const { result } = renderHook(() => useConnectionError());
    act(() => result.current.setConnectionError("socket", true));
    act(() => result.current.setConnectionError("meta-agent", true));
    act(() => result.current.setConnectionError("socket", false));
    act(() => result.current.setConnectionError("meta-agent", false));
    expect(result.current.connectionError).toBe(false);
  });

  it("deactivating an already-inactive source is a no-op", () => {
    const { result } = renderHook(() => useConnectionError());
    act(() => result.current.setConnectionError("socket", false));
    expect(result.current.connectionError).toBe(false);
  });

  it("activating the same source twice does not require two deactivations", () => {
    const { result } = renderHook(() => useConnectionError());
    act(() => result.current.setConnectionError("socket", true));
    act(() => result.current.setConnectionError("socket", true));
    act(() => result.current.setConnectionError("socket", false));
    expect(result.current.connectionError).toBe(false);
  });
});
