import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { registerMeterPage } from "@api/meterRoutes.js";

describe("meter page", () => {
    let httpServer: http.Server;
    let base: string;
    let distPath: string;

    beforeAll(async () => {
        distPath = fs.mkdtempSync(path.join(os.tmpdir(), "meter-dist-"));
        fs.writeFileSync(path.join(distPath, "meter.html"), "<title>Council footprint</title>");
        const app = express();
        registerMeterPage(app, distPath);
        httpServer = http.createServer(app);
        await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
        base = `http://127.0.0.1:${(httpServer.address() as { port: number }).port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
        fs.rmSync(distPath, { recursive: true, force: true });
    });

    it.each(["/meter?venue=havremagasinet", "/meter/", "/meter/methodology"])(
        "serves the meter's own page at %s",
        async (url) => {
            const res = await fetch(`${base}${url}`);

            expect(res.status).toBe(200);
            expect(await res.text()).toContain("Council footprint");
            expect(res.headers.get("cache-control")).toContain("no-store");
        },
    );
});
