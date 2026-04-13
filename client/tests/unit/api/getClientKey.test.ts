import { describe, it, expect, vi, afterEach } from "vitest";
import { getClientKey } from "@/api/getClientKey";

describe("getClientKey", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("POSTs JSON body with language and Authorization Bearer creatorKey", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ value: "ephemeral-from-server" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const result = await getClientKey({ language: "en", creatorKey: "creator-secret" });

        expect(result).toEqual({ value: "ephemeral-from-server" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/clientkey",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    "Content-Type": "application/json",
                    Authorization: "Bearer creator-secret",
                }),
                body: JSON.stringify({ language: "en" }),
            })
        );
    });

    it("forwards AbortSignal when provided", async () => {
        const ac = new AbortController();
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ value: "k" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        await getClientKey({ language: "en", creatorKey: "k", signal: ac.signal });

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/clientkey",
            expect.objectContaining({ signal: ac.signal })
        );
    });

    it("throws with response text when not ok", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 403 }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(getClientKey({ language: "en", creatorKey: "bad" })).rejects.toThrow("nope");
    });
});
