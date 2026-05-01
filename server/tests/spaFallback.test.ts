import { describe, expect, it } from "vitest";
import { isBlockedScannerPath, shouldServeSpaShell } from "@utils/spaFallback.js";
import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages.js";

describe("spaFallback", () => {
    const ENGLISH_ONLY = ["en"] as const;
    const ENGLISH_AND_SWEDISH = ["en", "sv"] as const;

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
        it("serves the shell for valid routes in explicit single-language mode", () => {
            expect(shouldServeSpaShell("/", ENGLISH_ONLY)).toBe(true);
            expect(shouldServeSpaShell("/new", ENGLISH_ONLY)).toBe(true);
            expect(shouldServeSpaShell("/meeting/42", ENGLISH_ONLY)).toBe(true);
            expect(shouldServeSpaShell("/meeting/42/", ENGLISH_ONLY)).toBe(true);
        });

        it("returns false for bogus or unsupported routes in explicit single-language mode", () => {
            expect(shouldServeSpaShell("/favicon.ico", ENGLISH_ONLY)).toBe(false);
            expect(shouldServeSpaShell("/class19.php", ENGLISH_ONLY)).toBe(false);
            expect(shouldServeSpaShell("/meeting/not-a-number", ENGLISH_ONLY)).toBe(false);
            expect(shouldServeSpaShell("/en/new", ENGLISH_ONLY)).toBe(false);
            expect(shouldServeSpaShell("/totally-made-up", ENGLISH_ONLY)).toBe(false);
        });

        it("serves language-prefixed SPA routes in explicit multi-language mode", () => {
            expect(shouldServeSpaShell("/", ENGLISH_AND_SWEDISH)).toBe(true);
            expect(shouldServeSpaShell("/en", ENGLISH_AND_SWEDISH)).toBe(true);
            expect(shouldServeSpaShell("/sv/new", ENGLISH_AND_SWEDISH)).toBe(true);
            expect(shouldServeSpaShell("/en/meeting/9", ENGLISH_AND_SWEDISH)).toBe(true);

            expect(shouldServeSpaShell("/new", ENGLISH_AND_SWEDISH)).toBe(false);
            expect(shouldServeSpaShell("/meeting/9", ENGLISH_AND_SWEDISH)).toBe(false);
            expect(shouldServeSpaShell("/de/new", ENGLISH_AND_SWEDISH)).toBe(false);
            expect(shouldServeSpaShell("/sv/unknown", ENGLISH_AND_SWEDISH)).toBe(false);
        });

        it("uses the configured shared languages by default", () => {
            const configuredLanguages: readonly string[] = AVAILABLE_LANGUAGES;
            expect([1, 2]).toContain(configuredLanguages.length);

            if (configuredLanguages.length === 1) {
                expect(configuredLanguages).toEqual(ENGLISH_ONLY);
                expect(shouldServeSpaShell("/")).toBe(true);
                expect(shouldServeSpaShell("/new")).toBe(true);
                expect(shouldServeSpaShell("/meeting/9")).toBe(true);

                expect(shouldServeSpaShell("/en")).toBe(false);
                expect(shouldServeSpaShell("/en/new")).toBe(false);
                expect(shouldServeSpaShell("/totally-made-up")).toBe(false);
                return;
            }

            expect(configuredLanguages).toEqual(ENGLISH_AND_SWEDISH);
            expect(shouldServeSpaShell("/")).toBe(true);
            expect(shouldServeSpaShell("/en")).toBe(true);
            expect(shouldServeSpaShell("/sv/new")).toBe(true);
            expect(shouldServeSpaShell("/en/meeting/9")).toBe(true);

            expect(shouldServeSpaShell("/new")).toBe(false);
            expect(shouldServeSpaShell("/de/new")).toBe(false);
            expect(shouldServeSpaShell("/sv/unknown")).toBe(false);
        });
    });
});
