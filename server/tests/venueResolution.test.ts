import { beforeEach, describe, expect, it, vi } from "vitest";
import { publicVenues, resolveVenueId } from "@utils/venues.js";

const mockConfig = vi.hoisted(() => ({
    COUNCIL_VENUES: undefined as { id: string; name: string; alertEmails: string[] }[] | undefined,
}));

vi.mock("@root/src/config.js", () => ({ config: mockConfig }));

const OSLO = { id: "museum-oslo", name: "Museum Oslo", alertEmails: ["staff@museum.no"] };

describe("venue resolution", () => {
    beforeEach(() => {
        mockConfig.COUNCIL_VENUES = [OSLO];
    });

    it.each([
        { name: "a configured venue", value: "museum-oslo", configured: [OSLO], expected: "museum-oslo" },
        { name: "a configured venue with stray spaces", value: " museum-oslo ", configured: [OSLO], expected: "museum-oslo" },
        { name: "a venue that is not configured", value: "museum-bergen", configured: [OSLO], expected: undefined },
        { name: "any well-formed id when no venues are configured", value: "my-laptop", configured: undefined, expected: "my-laptop" },
        { name: "a malformed id", value: "Museum Oslo!", configured: undefined, expected: undefined },
        { name: "no id", value: undefined, configured: [OSLO], expected: undefined },
    ])("resolves $name", ({ value, configured, expected }) => {
        mockConfig.COUNCIL_VENUES = configured;

        expect(resolveVenueId(value)).toBe(expected);
    });

    it("lists venues publicly without their addresses", () => {
        expect(publicVenues()).toEqual([{ id: "museum-oslo", name: "Museum Oslo" }]);
    });
});
