import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@shared/ModelTypes";
import SummaryPrintJob from "@council/protocol/SummaryPrintJob";

const mockPrintProtocolOnce = vi.fn();
const mockCreateProtocolPdf = vi.fn();

vi.mock("@/museum/print/printClient", () => ({
  printProtocolOnce: (...args: unknown[]) => mockPrintProtocolOnce(...args),
}));

vi.mock("@council/protocol/protocolPdf", () => ({
  createProtocolPdf: (...args: unknown[]) => mockCreateProtocolPdf(...args),
}));

vi.mock("@council/protocol/ProtocolDocument", () => ({
  default: ({ ref, summaryText }: { ref: React.Ref<HTMLDivElement>; summaryText: string }) => (
    <div ref={ref} data-testid="protocol-document">{summaryText}</div>
  ),
}));

vi.mock("qrcode.react", () => ({ QRCodeCanvas: () => null }));

const speech = { type: "message", id: "m1", text: "Hello council" } as unknown as Message;
const summary = { type: "summary", id: "s1", text: "# Protocol" } as unknown as Message;
const letterSummary = (present: boolean) => ({
  type: "summary", id: "s2", speaker: "reindeer", text: "Dear Skogsstyrelsen, please wait.",
  letter: {
    authorId: "reindeer", authorName: "Reindeer", recipientName: "Skogsstyrelsen", recipientOrganisation: null,
    subject: "Three weeks", body: "Dear Skogsstyrelsen, please wait.", humanNote: null, footer: "Sent by Council of Forest",
    present, send: present, sendReason: present ? null : "the human did not answer",
  },
}) as unknown as Message;

describe("SummaryPrintJob", () => {
  beforeEach(() => {
    mockPrintProtocolOnce.mockReset();
    mockCreateProtocolPdf.mockReset();
  });

  it("waits for the summary, then prints the meeting's protocol from the rendered document", async () => {
    const blob = new Blob(["%PDF-"]);
    mockCreateProtocolPdf.mockResolvedValue({ output: vi.fn().mockReturnValue(blob) });

    const { rerender, getByTestId } = render(
      <SummaryPrintJob meetingId={42} textMessages={[speech]} />,
    );
    expect(mockPrintProtocolOnce).not.toHaveBeenCalled();

    rerender(<SummaryPrintJob meetingId={42} textMessages={[speech, summary]} />);

    expect(mockPrintProtocolOnce).toHaveBeenCalledTimes(1);
    const [meetingId, createPdf] = mockPrintProtocolOnce.mock.calls[0];
    expect(meetingId).toBe(42);
    await expect(createPdf()).resolves.toBe(blob);
    expect(mockCreateProtocolPdf).toHaveBeenCalledWith(getByTestId("protocol-document"));
  });

  it("prints a letter as a letter: who it is from and to, what it says, and its footer", () => {
    const { getByTestId } = render(<SummaryPrintJob meetingId={42} textMessages={[letterSummary(true)]} />);

    expect(mockPrintProtocolOnce).toHaveBeenCalledTimes(1);
    const printed = getByTestId("protocol-document").textContent ?? "";
    for (const expected of ["Reindeer", "Skogsstyrelsen", "Three weeks", "please wait", "Sent by Council of Forest"]) {
      expect(printed).toContain(expected);
    }
  });

  it("does not print a letter when the human was not there to answer", () => {
    const { queryByTestId } = render(<SummaryPrintJob meetingId={42} textMessages={[letterSummary(false)]} />);

    expect(mockPrintProtocolOnce).not.toHaveBeenCalled();
    expect(queryByTestId("protocol-document")).toBeNull();
  });

  it("does not ask again when later messages arrive after the summary", () => {
    const { rerender } = render(<SummaryPrintJob meetingId={42} textMessages={[summary]} />);
    rerender(<SummaryPrintJob meetingId={42} textMessages={[summary, speech]} />);

    expect(mockPrintProtocolOnce).toHaveBeenCalledTimes(1);
  });
});
