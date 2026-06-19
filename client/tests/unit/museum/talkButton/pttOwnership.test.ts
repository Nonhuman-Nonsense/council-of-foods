import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  claimPtt,
  getCurrentPttOwner,
  onPttOwnerChange,
  _resetPttOwnership,
} from "@/museum/talkButton/pttOwnership";

describe("pttOwnership", () => {
  beforeEach(() => {
    _resetPttOwnership();
  });

  it("starts with no owner", () => {
    expect(getCurrentPttOwner()).toBeNull();
  });

  it("single claim sets owner", () => {
    claimPtt("meta-agent");
    expect(getCurrentPttOwner()).toBe("meta-agent");
  });

  it("releasing single claim returns to null", () => {
    const release = claimPtt("meta-agent");
    release();
    expect(getCurrentPttOwner()).toBeNull();
  });

  it("second claim wins (most recent = top of stack)", () => {
    claimPtt("meta-agent");
    claimPtt("human-input");
    expect(getCurrentPttOwner()).toBe("human-input");
  });

  it("releasing top-of-stack owner reveals previous owner", () => {
    claimPtt("meta-agent");
    const releaseHuman = claimPtt("human-input");
    releaseHuman();
    expect(getCurrentPttOwner()).toBe("meta-agent");
  });

  it("releasing bottom owner does not affect top owner", () => {
    const releaseMeta = claimPtt("meta-agent");
    claimPtt("human-input");
    releaseMeta(); // meta-agent was not on top
    expect(getCurrentPttOwner()).toBe("human-input");
  });

  it("re-claiming the same id moves it to the top", () => {
    claimPtt("meta-agent");
    claimPtt("human-input");
    claimPtt("meta-agent"); // re-claim
    expect(getCurrentPttOwner()).toBe("meta-agent");
  });

  it("releasing a claim that was re-claimed leaves stack empty", () => {
    const release = claimPtt("meta-agent");
    claimPtt("meta-agent"); // same id, re-claim replaces slot
    release(); // releases the only remaining "meta-agent" entry
    expect(getCurrentPttOwner()).toBeNull();
  });

  // ── Listeners ────────────────────────────────────────────────────────────────

  it("notifies listener when ownership changes", () => {
    const onChange = vi.fn();
    onPttOwnerChange(onChange);

    claimPtt("meta-agent");
    expect(onChange).toHaveBeenCalledWith("meta-agent");
  });

  it("notifies with null when last owner releases", () => {
    const onChange = vi.fn();
    const release = claimPtt("meta-agent");
    onPttOwnerChange(onChange);
    release();
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("notifies with new top when second owner releases", () => {
    claimPtt("meta-agent");
    const releaseHuman = claimPtt("human-input");
    const onChange = vi.fn();
    onPttOwnerChange(onChange);
    releaseHuman();
    expect(onChange).toHaveBeenCalledWith("meta-agent");
  });

  it("listener unsubscribe stops notifications", () => {
    const onChange = vi.fn();
    const unsub = onPttOwnerChange(onChange);
    unsub();
    claimPtt("meta-agent");
    expect(onChange).not.toHaveBeenCalled();
  });
});
