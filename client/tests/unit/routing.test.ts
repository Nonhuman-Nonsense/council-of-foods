import { describe, it, expect } from "vitest";
import { meetingPath, meetingRoutesBase } from "@/routing";

/**
 * `removeOverlay` does `navigate(\`${baseUrl}/${meetingId}\`)` with `baseUrl = meetingRoutesBase(lang)`.
 * That must equal `meetingPath(lang, meetingId)` whether the app uses `/meeting/:id` or `/:lang/meeting/:id`,
 * because both helpers use the same `getBasePath(lang)` from `AVAILABLE_LANGUAGES`.
 */
describe("routing bridge", () => {
    it("meetingRoutesBase + id equals meetingPath (single- and multi-language safe)", () => {
        const lang = "en";
        const id = 175;
        expect(`${meetingRoutesBase(lang)}/${id}`).toBe(meetingPath(lang, id));
    });
});
