import { describe, expect, it } from "vitest";
import {
    buildSpaShellHtml,
    getSpaRedirectTarget,
    isBlockedScannerPath,
    shouldServeSpaShell,
} from "@utils/spaShell.js";
import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages.js";

describe("spaShell", () => {
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

    describe("getSpaRedirectTarget", () => {
        it("redirects to / in single-language mode", () => {
            expect(getSpaRedirectTarget("/hello", ENGLISH_ONLY)).toBe("/");
            expect(getSpaRedirectTarget("/meeting/not-a-number", ENGLISH_ONLY)).toBe("/");
            expect(getSpaRedirectTarget("/en/new", ENGLISH_ONLY)).toBe("/");
            expect(getSpaRedirectTarget("/new", ENGLISH_ONLY)).toBe("/");
            expect(getSpaRedirectTarget("/meeting/9", ENGLISH_ONLY)).toBe("/");
            expect(getSpaRedirectTarget("/", ENGLISH_ONLY)).toBe("/");
        });

        it("redirects invalid multi-language routes to the matching language root", () => {
            expect(getSpaRedirectTarget("/hello", ENGLISH_AND_SWEDISH)).toBe("/en/");
            expect(getSpaRedirectTarget("/sv/hello", ENGLISH_AND_SWEDISH)).toBe("/sv/");
            expect(getSpaRedirectTarget("/en/foo", ENGLISH_AND_SWEDISH)).toBe("/en/");
            expect(getSpaRedirectTarget("/de/hello", ENGLISH_AND_SWEDISH)).toBe("/en/");
            expect(getSpaRedirectTarget("/meeting/not-a-number", ENGLISH_AND_SWEDISH)).toBe("/en/");
        });

        it("redirects the site root to a language root in multi-language mode", () => {
            expect(getSpaRedirectTarget("/", ENGLISH_AND_SWEDISH)).toBe("/en/");
            expect(getSpaRedirectTarget("/", ENGLISH_AND_SWEDISH, "sv")).toBe("/sv/");
        });

        it("preserves valid unprefixed SPA routes in multi-language mode", () => {
            expect(getSpaRedirectTarget("/new", ENGLISH_AND_SWEDISH)).toBe("/en/new");
            expect(getSpaRedirectTarget("/new/", ENGLISH_AND_SWEDISH)).toBe("/en/new");
            expect(getSpaRedirectTarget("/meeting/9", ENGLISH_AND_SWEDISH)).toBe("/en/meeting/9");
            expect(getSpaRedirectTarget("/meeting/215/", ENGLISH_AND_SWEDISH)).toBe("/en/meeting/215");
        });

        it("preserves valid routes behind an unknown language prefix", () => {
            expect(getSpaRedirectTarget("/de/new", ENGLISH_AND_SWEDISH)).toBe("/en/new");
            expect(getSpaRedirectTarget("/de/meeting/215", ENGLISH_AND_SWEDISH)).toBe("/en/meeting/215");
        });

        it("uses preferredLang when no language prefix is present", () => {
            expect(getSpaRedirectTarget("/hello", ENGLISH_AND_SWEDISH, "sv")).toBe("/sv/");
            expect(getSpaRedirectTarget("/hello", ENGLISH_AND_SWEDISH, "de")).toBe("/en/");
            expect(getSpaRedirectTarget("/", ENGLISH_AND_SWEDISH, "sv")).toBe("/sv/");
            expect(getSpaRedirectTarget("/new", ENGLISH_AND_SWEDISH, "sv")).toBe("/sv/new");
            expect(getSpaRedirectTarget("/meeting/215", ENGLISH_AND_SWEDISH, "sv")).toBe("/sv/meeting/215");
        });

        it("ignores preferredLang in single-language mode", () => {
            expect(getSpaRedirectTarget("/hello", ENGLISH_ONLY, "sv")).toBe("/");
        });
    });

    describe("buildSpaShellHtml", () => {
        it("injects bootstrap before </head>", () => {
            const html = "<!DOCTYPE html><html><head><title>x</title></head><body></body></html>";
            const result = buildSpaShellHtml(html, "en");

            expect(result).toContain('window.__COF_BOOTSTRAP__={"preferredLang":"en"}');
            expect(result.indexOf("__COF_BOOTSTRAP__")).toBeLessThan(result.indexOf("</head>"));
        });

        it("prefixes bootstrap when </head> is missing", () => {
            const html = "<html><body></body></html>";
            const result = buildSpaShellHtml(html, "en");

            expect(result.startsWith('<script>window.__COF_BOOTSTRAP__={"preferredLang":"en"}</script>')).toBe(true);
        });
    });
});
