import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import http from "http";
import { registerMeetingRoutes } from "@api/meetingRoutes.js";
import { getClientKey } from "@api/getClientKey.js";

vi.mock("@api/getClientKey.js", () => ({
    getClientKey: vi.fn(),
}));

function validCreateBody() {
    return {
        topic: { id: "t-ck", title: "Topic", description: "D", prompt: "P" },
        characters: [{ id: "water", name: "Water", type: "food", voice: "alloy" }],
        language: "en",
    };
}

describe("POST /api/clientkey (integration)", () => {
    let httpServer;
    let port;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        registerMeetingRoutes(app, "test");
        httpServer = http.createServer(app);
        port = await new Promise((resolve, reject) => {
            httpServer.listen(0, "127.0.0.1", () => {
                const addr = httpServer.address();
                if (addr && typeof addr !== "string") resolve(addr.port);
                else reject(new Error("no port"));
            });
            httpServer.on("error", reject);
        });
    });

    afterAll(
        async () =>
            new Promise((resolve) => {
                httpServer?.close(() => resolve());
            })
    );

    beforeEach(() => {
        vi.mocked(getClientKey).mockReset();
        vi.mocked(getClientKey).mockResolvedValue({ value: "mock-ephemeral-key" });
    });

    const base = () => `http://127.0.0.1:${port}`;

    async function createMeetingAndKey() {
        const createRes = await fetch(`${base()}/api/meetings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(validCreateBody()),
        });
        expect(createRes.status).toBe(201);
        const { creatorKey } = await createRes.json();
        return creatorKey;
    }

    it("returns 401 without Authorization", async () => {
        const res = await fetch(`${base()}/api/clientkey`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ language: "en" }),
        });
        expect(res.status).toBe(401);
        expect(vi.mocked(getClientKey)).not.toHaveBeenCalled();
    });

    it("returns 403 when Bearer creatorKey is not in the database", async () => {
        const res = await fetch(`${base()}/api/clientkey`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer 00000000-0000-4000-8000-000000000000",
            },
            body: JSON.stringify({ language: "en" }),
        });
        expect(res.status).toBe(403);
        expect(vi.mocked(getClientKey)).not.toHaveBeenCalled();
    });

    it("returns 400 when language is missing or not allowed", async () => {
        const creatorKey = await createMeetingAndKey();

        const resMissing = await fetch(`${base()}/api/clientkey`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${creatorKey}`,
            },
            body: JSON.stringify({}),
        });
        expect(resMissing.status).toBe(400);
        expect(vi.mocked(getClientKey)).not.toHaveBeenCalled();

        const resBad = await fetch(`${base()}/api/clientkey`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${creatorKey}`,
            },
            body: JSON.stringify({ language: "xx" }),
        });
        expect(resBad.status).toBe(400);
        expect(vi.mocked(getClientKey)).not.toHaveBeenCalled();
    });

    it("returns 200 and delegates to getClientKey when authorized", async () => {
        const creatorKey = await createMeetingAndKey();

        const res = await fetch(`${base()}/api/clientkey`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${creatorKey}`,
            },
            body: JSON.stringify({ language: "en" }),
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toEqual({ value: "mock-ephemeral-key" });
        expect(vi.mocked(getClientKey)).toHaveBeenCalledWith("en");
    });
});
