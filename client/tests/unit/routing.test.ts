import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useRouting } from "@/routing";

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ i18n: { language: "en" } }),
}));

/**
 * `removeOverlay` does `navigate(\`${meetingRoutesBase}/${meetingId}\`)`.
 * That must equal `meetingPath(meetingId)` from the same hook call,
 * because both use the same base path derived from i18n.language.
 */
describe("routing bridge", () => {
    it("meetingRoutesBase + id equals meetingPath (single- and multi-language safe)", () => {
        const id = 175;
        const { result } = renderHook(() => useRouting());
        const { meetingRoutesBase, meetingPath } = result.current;
        expect(`${meetingRoutesBase}/${id}`).toBe(meetingPath(id));
    });
});
