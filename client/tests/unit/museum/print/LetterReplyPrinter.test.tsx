import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrintableLetterReply } from "@shared/ModelTypes";

const printClient = vi.hoisted(() => ({
  fetchRepliesToPrint: vi.fn(),
  sendReplyToPrinter: vi.fn(),
  markReplyPrinted: vi.fn(),
}));
vi.mock("@/museum/print/printClient", () => printClient);
const protocolPdf = vi.hoisted(() => ({
  createProtocolPdf: vi.fn(async () => ({ output: () => new Blob(["%PDF-"]) })),
}));
vi.mock("@council/protocol/protocolPdf", () => protocolPdf);
vi.mock("@council/protocol/ReplyDocument", () => ({
  default: ({ ref, reply }: { ref: React.Ref<HTMLDivElement>; reply: PrintableLetterReply }) => (
    <div ref={ref} data-testid="reply-document">{reply.message}</div>
  ),
}));
vi.mock("@/navigation", () => ({ useRouting: () => ({ meetingPath: (id: number) => `/meeting/${id}` }) }));

const { default: LetterReplyPrinter, REPLY_POLL_MS } = await import("@/museum/print/LetterReplyPrinter");

const reply = (id: string): PrintableLetterReply => ({
  id, meetingId: 1400, kind: "reply", fromName: "Anna Andersson", subject: "Re: Tre veckor",
  message: "Tack för brevet.", receivedAt: "2026-10-12T10:00:00.000Z",
  letter: { authorId: "reindeer", authorName: "Renen", recipientName: "Skogsstyrelsen", subject: "Tre veckor", language: "sv" },
});

describe("LetterReplyPrinter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    printClient.fetchRepliesToPrint.mockReset().mockResolvedValue([]);
    printClient.sendReplyToPrinter.mockReset().mockResolvedValue("queued");
    printClient.markReplyPrinted.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("prints each new reply and tells the server it is printed", async () => {
    printClient.fetchRepliesToPrint.mockResolvedValueOnce([reply("a".repeat(24))]);

    render(<LetterReplyPrinter />);

    await vi.waitFor(() => expect(printClient.markReplyPrinted).toHaveBeenCalledWith("a".repeat(24)));
    expect(printClient.sendReplyToPrinter).toHaveBeenCalledTimes(1);
    expect(printClient.sendReplyToPrinter.mock.calls[0][0]).toBe("a".repeat(24));
    expect(protocolPdf.createProtocolPdf).toHaveBeenCalledWith(expect.anything(), { magnetMark: true });
  });

  it("asks again every minute for replies that arrived since", async () => {
    render(<LetterReplyPrinter />);
    await vi.waitFor(() => expect(printClient.fetchRepliesToPrint).toHaveBeenCalledTimes(1));

    printClient.fetchRepliesToPrint.mockResolvedValueOnce([reply("b".repeat(24))]);
    await vi.advanceTimersByTimeAsync(REPLY_POLL_MS);

    await vi.waitFor(() => expect(printClient.markReplyPrinted).toHaveBeenCalledWith("b".repeat(24)));
  });

  it("does not mark a reply the bridge refused, nor try it again before a reload", async () => {
    printClient.fetchRepliesToPrint.mockResolvedValue([reply("c".repeat(24))]);
    printClient.sendReplyToPrinter.mockResolvedValue("rejected");

    render(<LetterReplyPrinter />);
    await vi.waitFor(() => expect(printClient.sendReplyToPrinter).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(REPLY_POLL_MS * 2);

    expect(printClient.sendReplyToPrinter).toHaveBeenCalledTimes(1);
    expect(printClient.markReplyPrinted).not.toHaveBeenCalled();
  });
});
