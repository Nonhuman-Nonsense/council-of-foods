import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAgentPresence } from "@setupAgent/useAgentPresence";
import type { SetupAgentState } from "@setupAgent/useSetupAgent";

const HIDDEN_GRACE_MS = 60_000;
const IDLE_TIMEOUT_MS = 3 * 60_000;

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
}

function setFocused(focused: boolean): void {
  document.hasFocus = vi.fn(() => focused);
}

function fireVisibilityChange(): void {
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

function fireBlur(): void {
  act(() => {
    window.dispatchEvent(new Event("blur"));
  });
}

function fireFocus(): void {
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
}

function baseAgent(overrides: Partial<SetupAgentState> = {}): SetupAgentState {
  return {
    isConnecting: false,
    isReady: true,
    hasEverHeardVisitor: true,
    lastCaption: null,
    lastUserTranscript: null,
    agentSpeaking: false,
    micStream: null,
    micAttaching: false,
    muted: false,
    setMuted: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    sendUserMessage: vi.fn(),
    requestAgentResponse: vi.fn(),
    interruptAndRespond: vi.fn(),
    ...overrides,
  };
}

describe("useAgentPresence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setHidden(false);
    setFocused(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    setHidden(false);
    setFocused(true);
  });

  it("tears down after the grace period when the tab is hidden", () => {
    const stop = vi.fn();
    const agent = baseAgent({ stop });
    renderHook((props) => useAgentPresence(props), {
      initialProps: { agent, phase: "topic" as const },
    });

    setHidden(true);
    fireVisibilityChange();
    vi.advanceTimersByTime(HIDDEN_GRACE_MS);

    expect(stop).toHaveBeenCalledOnce();
  });

  it("tears down after the grace period when the window loses focus while the tab stays visible", () => {
    // The regression this hook now closes: switching to another program
    // leaves the tab "visible" per the Page Visibility spec, so this case was
    // previously invisible to the hook entirely — it relied on the slower
    // 3-minute absolute idle timer instead.
    const stop = vi.fn();
    const agent = baseAgent({ stop });
    renderHook((props) => useAgentPresence(props), {
      initialProps: { agent, phase: "topic" as const },
    });

    setFocused(false);
    fireBlur();
    vi.advanceTimersByTime(HIDDEN_GRACE_MS);

    expect(stop).toHaveBeenCalledOnce();
  });

  it("does not tear down if the visitor returns within the grace period", () => {
    const stop = vi.fn();
    const agent = baseAgent({ stop });
    renderHook((props) => useAgentPresence(props), {
      initialProps: { agent, phase: "topic" as const },
    });

    setFocused(false);
    fireBlur();
    vi.advanceTimersByTime(HIDDEN_GRACE_MS - 1000);

    setFocused(true);
    fireFocus();
    vi.advanceTimersByTime(2000);

    expect(stop).not.toHaveBeenCalled();
  });

  it("sends a welcome-back message on a quick return, rather than a full restart", () => {
    const sendUserMessage = vi.fn();
    const requestAgentResponse = vi.fn();
    const agent = baseAgent({ sendUserMessage, requestAgentResponse });
    renderHook((props) => useAgentPresence(props), {
      initialProps: { agent, phase: "topic" as const },
    });

    setFocused(false);
    fireBlur();
    setFocused(true);
    fireFocus();

    expect(sendUserMessage).toHaveBeenCalledOnce();
    expect(requestAgentResponse).toHaveBeenCalledOnce();
  });

  it("resumes through a single path regardless of which teardown fired, and does not double-resume", () => {
    // Both teardown reasons set the same shared flag and rely on the one
    // presence effect to notice a return — previously the idle timer had its
    // own separate `window.addEventListener("focus", ...)` resume path, which
    // raced this one for the same event once presence also reacted to focus.
    const start = vi.fn();
    const agent = baseAgent({ start });
    renderHook((props) => useAgentPresence(props), {
      initialProps: { agent, phase: "topic" as const },
    });

    setFocused(false);
    fireBlur();
    vi.advanceTimersByTime(HIDDEN_GRACE_MS);
    expect(agent.stop).toHaveBeenCalledOnce();

    setFocused(true);
    fireFocus();

    expect(start).toHaveBeenCalledOnce();
  });

  it("tears down after the absolute idle timeout even while fully present", () => {
    const stop = vi.fn();
    const agent = baseAgent({ stop });
    renderHook((props) => useAgentPresence(props), {
      initialProps: { agent, phase: "topic" as const },
    });

    vi.advanceTimersByTime(IDLE_TIMEOUT_MS);

    expect(stop).toHaveBeenCalledOnce();
  });

  it("resumes an idle-timeout teardown once presence changes, via the same shared path", () => {
    const start = vi.fn();
    const agent = baseAgent({ start });
    renderHook((props) => useAgentPresence(props), {
      initialProps: { agent, phase: "topic" as const },
    });

    vi.advanceTimersByTime(IDLE_TIMEOUT_MS);
    expect(agent.stop).toHaveBeenCalledOnce();

    setFocused(false);
    fireBlur();
    setFocused(true);
    fireFocus();

    expect(start).toHaveBeenCalledOnce();
  });

  it("resets the idle timer on new visitor speech", () => {
    const stop = vi.fn();
    const agent = baseAgent({ stop, lastUserTranscript: "hello" });
    const { rerender } = renderHook((props) => useAgentPresence(props), {
      initialProps: { agent, phase: "topic" as const },
    });

    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1000);
    rerender({ agent: baseAgent({ stop, lastUserTranscript: "still here" }), phase: "topic" as const });
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1000);

    expect(stop).not.toHaveBeenCalled();
  });
});
