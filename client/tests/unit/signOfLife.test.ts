import { describe, it, expect, beforeEach } from "vitest";
import { hasSignOfLife, installSignOfLife, resetSignOfLifeForTests } from "@/signOfLife";

describe("signOfLife", () => {
  beforeEach(() => {
    resetSignOfLifeForTests();
    installSignOfLife();
  });

  it("reports no sign of life before any interaction", () => {
    expect(hasSignOfLife()).toBe(false);
  });

  it.each(["pointermove", "pointerdown", "touchstart", "scroll", "keydown"])(
    "counts %s as a sign of life",
    (type) => {
      window.dispatchEvent(new Event(type));
      expect(hasSignOfLife()).toBe(true);
    },
  );
});
