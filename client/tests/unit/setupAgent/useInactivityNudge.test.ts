import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useInactivityNudge } from "@setupAgent/useInactivityNudge";

const DELAY_MS = 10_000;

function baseParams(overrides: Partial<Parameters<typeof useInactivityNudge>[0]> = {}) {
  return {
    agentSpeaking: false,
    lastUserTranscript: null,
    sendMessage: vi.fn(),
    requestResponse: vi.fn(),
    message: "The visitor is quiet.",
    delayMs: DELAY_MS,
    enabled: true,
    ...overrides,
  };
}

describe("useInactivityNudge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing until the agent has spoken at least once", () => {
    const sendMessage = vi.fn();
    renderHook((props) => useInactivityNudge(props), {
      initialProps: baseParams({ sendMessage }),
    });

    vi.advanceTimersByTime(DELAY_MS);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("fires after the agent stops speaking and the visitor stays silent", () => {
    const sendMessage = vi.fn();
    const requestResponse = vi.fn();
    const { rerender } = renderHook((props) => useInactivityNudge(props), {
      initialProps: baseParams({ sendMessage, requestResponse, agentSpeaking: true }),
    });

    rerender(baseParams({ sendMessage, requestResponse, agentSpeaking: false }));
    vi.advanceTimersByTime(DELAY_MS);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(requestResponse).toHaveBeenCalledTimes(1);
  });

  it("resets the countdown when the visitor speaks", () => {
    const sendMessage = vi.fn();
    const { rerender } = renderHook((props) => useInactivityNudge(props), {
      initialProps: baseParams({ sendMessage, agentSpeaking: true }),
    });
    rerender(baseParams({ sendMessage, agentSpeaking: false }));

    vi.advanceTimersByTime(DELAY_MS - 1);
    rerender(baseParams({ sendMessage, agentSpeaking: false, lastUserTranscript: "Hello" }));
    vi.advanceTimersByTime(DELAY_MS - 1);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  /**
   * The bug this covers: a visitor typing a panelist's description touches
   * neither `agentSpeaking` nor `lastUserTranscript`, so without this signal
   * the nudge fires "are you there?" while they're mid-sentence. `lastActivity`
   * is how callers report activity the hook can't otherwise observe.
   */
  it("resets the countdown on lastActivity changing, even with no transcript", () => {
    const sendMessage = vi.fn();
    const { rerender } = renderHook((props) => useInactivityNudge(props), {
      initialProps: baseParams({ sendMessage, agentSpeaking: true, lastActivity: "a" }),
    });
    rerender(baseParams({ sendMessage, agentSpeaking: false, lastActivity: "a" }));

    vi.advanceTimersByTime(DELAY_MS - 1);
    // Visitor typed another character — transcript stays null throughout.
    rerender(baseParams({ sendMessage, agentSpeaking: false, lastActivity: "b" }));
    vi.advanceTimersByTime(DELAY_MS - 1);

    expect(sendMessage).not.toHaveBeenCalled();

    // Once activity genuinely stops, the nudge still eventually fires.
    vi.advanceTimersByTime(2);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("clears the timer while the agent is speaking", () => {
    const sendMessage = vi.fn();
    const { rerender } = renderHook((props) => useInactivityNudge(props), {
      initialProps: baseParams({ sendMessage, agentSpeaking: true }),
    });
    rerender(baseParams({ sendMessage, agentSpeaking: false }));
    vi.advanceTimersByTime(DELAY_MS - 1);

    rerender(baseParams({ sendMessage, agentSpeaking: true }));
    vi.advanceTimersByTime(DELAY_MS);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("does not fire while disabled", () => {
    const sendMessage = vi.fn();
    const { rerender } = renderHook((props) => useInactivityNudge(props), {
      initialProps: baseParams({ sendMessage, agentSpeaking: true }),
    });
    rerender(baseParams({ sendMessage, agentSpeaking: false, enabled: false }));

    vi.advanceTimersByTime(DELAY_MS);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
