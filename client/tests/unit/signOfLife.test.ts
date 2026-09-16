import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { hasSignOfLife, installSignOfLife, resetSignOfLifeForTests, useSignOfLife } from "@/signOfLife";

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

  it("re-renders the hook when the first sign of life arrives", () => {
    const { result } = renderHook(() => useSignOfLife());
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(result.current).toBe(true);
  });
});
