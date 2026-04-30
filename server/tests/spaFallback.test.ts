import { describe, expect, it } from "vitest";
import { isBlockedScannerPath, shouldServeSpaShell } from "@utils/spaFallback.js";

describe("spaFallback", () => {
    describe("isBlockedScannerPath", () => {
        it("blocks common scanner targets and executable probes", () => {
            expect(isBlockedScannerPath("/class19.php")).toBe(true);
            expect(isBlockedScannerPath("/wp-admin/images/admin.php")).toBe(true);
            expect(isBlockedScannerPath("/.env")).toBe(true);
            expect(isBlockedScannerPath("/v1/models")).toBe(true);
            expect(isBlockedScannerPath("/api/unknown")).toBe(true);
            expect(isBlockedScannerPath("/socket.io/evil")).toBe(true);
        });

        it("does not block valid SPA routes or ACME challenges", () => {
            expect(isBlockedScannerPath("/")).toBe(false);
            expect(isBlockedScannerPath("/new")).toBe(false);
            expect(isBlockedScannerPath("/meeting/123")).toBe(false);
            expect(isBlockedScannerPath("/.well-known/acme-challenge/token")).toBe(false);
        });
    });

    describe("shouldServeSpaShell", () => {
        it("serves the shell for valid single-language routes", () => {
            expect(shouldServeSpaShell("/")).toBe(true);
            expect(shouldServeSpaShell("/new")).toBe(true);
            expect(shouldServeSpaShell("/meeting/42")).toBe(true);
            expect(shouldServeSpaShell("/meeting/42/")).toBe(true);
        });

        it("returns false for bogus or unsupported single-language routes", () => {
            expect(shouldServeSpaShell("/favicon.ico")).toBe(false);
            expect(shouldServeSpaShell("/class19.php")).toBe(false);
            expect(shouldServeSpaShell("/meeting/not-a-number")).toBe(false);
            expect(shouldServeSpaShell("/en/new")).toBe(false);
            expect(shouldServeSpaShell("/totally-made-up")).toBe(false);
        });

        it("supports language-prefixed routes when multiple languages are enabled", () => {
            const languages = ["en", "sv"] as const;

            expect(shouldServeSpaShell("/", languages)).toBe(true);
            expect(shouldServeSpaShell("/en", languages)).toBe(true);
            expect(shouldServeSpaShell("/sv/new", languages)).toBe(true);
            expect(shouldServeSpaShell("/en/meeting/9", languages)).toBe(true);

            expect(shouldServeSpaShell("/new", languages)).toBe(false);
            expect(shouldServeSpaShell("/de/new", languages)).toBe(false);
            expect(shouldServeSpaShell("/sv/unknown", languages)).toBe(false);
        });
    });
});
