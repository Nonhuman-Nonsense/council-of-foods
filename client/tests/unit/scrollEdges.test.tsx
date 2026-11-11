import { describe, it, expect } from "vitest";
import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { readScrollEdges, useScrollEdges, type ScrollEdges } from "@/scrollEdges";

function sizeBox(el: HTMLElement, { position, visible, total }: { position: number; visible: number; total: number }) {
  Object.defineProperty(el, "scrollLeft", { configurable: true, value: position });
  Object.defineProperty(el, "clientWidth", { configurable: true, value: visible });
  Object.defineProperty(el, "scrollWidth", { configurable: true, value: total });
}

describe("scroll edges", () => {
  it("reports what lies beyond each edge of a scroll box", () => {
    const cases = [
      { label: "fits", position: 0, visible: 600, total: 600, expected: { moreBefore: false, moreAfter: false } },
      { label: "at the start", position: 0, visible: 600, total: 750, expected: { moreBefore: false, moreAfter: true } },
      { label: "in the middle", position: 70, visible: 600, total: 750, expected: { moreBefore: true, moreAfter: true } },
      { label: "at the end", position: 150, visible: 600, total: 750, expected: { moreBefore: true, moreAfter: false } },
      // Fractional widths leave the end a hair short of the total.
      { label: "a hair from the end", position: 149.5, visible: 600, total: 750, expected: { moreBefore: true, moreAfter: false } },
    ];

    for (const { label, expected, ...size } of cases) {
      const el = document.createElement("div");
      sizeBox(el, size);
      expect(readScrollEdges(el, "x"), label).toEqual(expected);
    }
  });

  it("follows the box as it is scrolled", () => {
    let seen: ScrollEdges | null = null;
    function Row() {
      const ref = useRef<HTMLDivElement>(null);
      seen = useScrollEdges(ref, "x");
      return <div ref={ref} data-testid="row" />;
    }
    const { getByTestId } = render(<Row />);
    const row = getByTestId("row");

    act(() => {
      sizeBox(row, { position: 0, visible: 600, total: 750 });
      row.dispatchEvent(new Event("scroll"));
    });
    expect(seen).toEqual({ moreBefore: false, moreAfter: true });

    act(() => {
      sizeBox(row, { position: 150, visible: 600, total: 750 });
      row.dispatchEvent(new Event("scroll"));
    });
    expect(seen).toEqual({ moreBefore: true, moreAfter: false });
  });
});
