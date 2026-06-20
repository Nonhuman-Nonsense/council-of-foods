import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetButtonOwnership,
  claimButton,
  getCurrentButtonOwner,
  onButtonOwnerChange,
} from "@/museum/button/buttonOwnership";

describe("button ownership", () => {
  beforeEach(() => {
    _resetButtonOwnership();
  });

  it("returns null when no owner", () => {
    expect(getCurrentButtonOwner()).toBeNull();
  });

  it("tracks a single owner", () => {
    claimButton("meta-agent");
    expect(getCurrentButtonOwner()).toBe("meta-agent");
  });

  it("releases ownership on cleanup", () => {
    const release = claimButton("meta-agent");
    release();
    expect(getCurrentButtonOwner()).toBeNull();
  });

  it("uses stack order for multiple owners", () => {
    claimButton("meta-agent");
    claimButton("human-input");
    expect(getCurrentButtonOwner()).toBe("human-input");
  });

  it("restores previous owner when top releases", () => {
    claimButton("meta-agent");
    const releaseHuman = claimButton("human-input");
    releaseHuman();
    expect(getCurrentButtonOwner()).toBe("meta-agent");
  });

  it("re-claiming same id moves it to top", () => {
    claimButton("meta-agent");
    claimButton("human-input");
    claimButton("meta-agent");
    expect(getCurrentButtonOwner()).toBe("meta-agent");
  });

  it("notifies listeners on change", () => {
    const owners: Array<string | null> = [];
    const unsubscribe = onButtonOwnerChange((owner) => owners.push(owner));
    claimButton("meta-agent");
    claimButton("human-input");
    unsubscribe();
    expect(owners).toEqual(["meta-agent", "human-input"]);
  });
});
