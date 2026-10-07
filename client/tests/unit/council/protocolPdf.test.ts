import { beforeEach, describe, expect, it, vi } from "vitest";

const pdf = vi.hoisted(() => ({
  setFont: vi.fn(),
  html: vi.fn((_element: HTMLElement, { callback }: { callback: () => void }) => callback()),
  setPage: vi.fn(),
  setDrawColor: vi.fn(),
  setLineWidth: vi.fn(),
  circle: vi.fn(),
  internal: { pageSize: { getWidth: () => 595.28 } },
}));
vi.mock("jspdf", () => ({ jsPDF: vi.fn(function () { return pdf; }) }));
vi.mock("@/Tinos.js", () => ({}));

const { createProtocolPdf } = await import("@council/protocol/protocolPdf");

const mm = (value: number) => (value * 72) / 25.4;

describe("createProtocolPdf", () => {
  beforeEach(() => {
    pdf.circle.mockClear();
  });

  it("marks where the magnets go: an empty 5 mm circle, centred, 20 mm from the top of the first page", async () => {
    await createProtocolPdf(document.createElement("div"), { magnetMark: true });

    expect(pdf.setPage).toHaveBeenCalledWith(1);
    expect(pdf.circle).toHaveBeenCalledTimes(1);
    const [x, y, radius, style] = pdf.circle.mock.calls[0];
    expect(x).toBeCloseTo(595.28 / 2);
    expect(y).toBeCloseTo(mm(20));
    expect(radius).toBeCloseTo(mm(2.5));
    expect(style).toBe("S");
  });

  it("leaves the mark off by default, as on a downloaded protocol", async () => {
    await createProtocolPdf(document.createElement("div"));

    expect(pdf.circle).not.toHaveBeenCalled();
  });
});
