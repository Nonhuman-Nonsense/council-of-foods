import { describe, it, expect } from "vitest";
import { httpErrorMessage } from "@api/httpErrorMessage";

describe("httpErrorMessage", () => {
    it("returns the server's message when present", async () => {
        const res = new Response(JSON.stringify({ message: "Meeting not found" }));
        await expect(httpErrorMessage(res, "fallback")).resolves.toBe("Meeting not found");
    });

    it("trims the message", async () => {
        const res = new Response(JSON.stringify({ message: "  spaced out  " }));
        await expect(httpErrorMessage(res, "fallback")).resolves.toBe("spaced out");
    });

    it("falls back when the message is empty or whitespace-only", async () => {
        const res = new Response(JSON.stringify({ message: "   " }));
        await expect(httpErrorMessage(res, "fallback")).resolves.toBe("fallback");
    });

    it("falls back when the body has no message field", async () => {
        const res = new Response(JSON.stringify({ error: "something" }));
        await expect(httpErrorMessage(res, "fallback")).resolves.toBe("fallback");
    });

    it("falls back when the body's message field isn't a string", async () => {
        const res = new Response(JSON.stringify({ message: 42 }));
        await expect(httpErrorMessage(res, "fallback")).resolves.toBe("fallback");
    });

    it("falls back when the body isn't JSON (avoids dumping raw HTML)", async () => {
        const res = new Response("<html>Internal Server Error</html>");
        await expect(httpErrorMessage(res, "fallback")).resolves.toBe("fallback");
    });

    it("falls back when the body is empty", async () => {
        const res = new Response("");
        await expect(httpErrorMessage(res, "fallback")).resolves.toBe("fallback");
    });
});
