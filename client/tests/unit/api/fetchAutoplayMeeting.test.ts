import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchAutoplayMeetingId } from "@api/fetchAutoplayMeeting";

describe("fetchAutoplayMeetingId", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    it.each([
        { name: "asks for any venue's meetings without a venue", venueId: null, url: "/api/autoplay?language=sv" },
        { name: "asks for the installation's venue when one is set", venueId: "havremagasinet", url: "/api/autoplay?language=sv&venue=havremagasinet" },
    ])("$name", async ({ venueId, url }) => {
        if (venueId) localStorage.setItem("councilVenueId", venueId);
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ meetingId: 7 }), { status: 200, headers: { "Content-Type": "application/json" } })
        );
        vi.stubGlobal("fetch", fetchMock);

        await expect(fetchAutoplayMeetingId("sv")).resolves.toBe(7);

        expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ method: "GET" }));
    });
});
