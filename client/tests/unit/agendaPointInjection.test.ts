// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  RANDOM_AGENDA_POINT_PLACEHOLDER,
  RANDOM_AGENDA_POINT_FALLBACK,
  injectRandomAgendaPoint,
  pickAgendaPoint,
} from "@shared/agendaPointInjection";

describe("agendaPointInjection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("pickAgendaPoint", () => {
    it("returns 1 when count is below 1", () => {
      expect(pickAgendaPoint(0)).toBe(1);
      expect(pickAgendaPoint(-3)).toBe(1);
    });

    it("returns a value within 1..count", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.999);
      expect(pickAgendaPoint(5)).toBe(5);

      vi.spyOn(Math, "random").mockReturnValue(0);
      expect(pickAgendaPoint(5)).toBe(1);
    });
  });

  describe("injectRandomAgendaPoint", () => {
    it("leaves the prompt unchanged when the placeholder is absent", () => {
      const prompt = "Moderate today's discussion.";
      expect(injectRandomAgendaPoint(prompt, ["One", "Two"])).toBe(prompt);
      expect(injectRandomAgendaPoint(prompt)).toBe(prompt);
    });

    it("replaces with a random index when agenda points are provided", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.4);
      const result = injectRandomAgendaPoint(
        `Open with ${RANDOM_AGENDA_POINT_PLACEHOLDER}.`,
        ["a", "b", "c", "d", "e"],
      );
      expect(result).toBe("Open with 3.");
    });

    it("replaces with the fallback sentence when agenda points are missing", () => {
      const result = injectRandomAgendaPoint(`Step: ${RANDOM_AGENDA_POINT_PLACEHOLDER}`);
      expect(result).toBe(`Step: ${RANDOM_AGENDA_POINT_FALLBACK}`);
    });

    it("replaces with the fallback sentence when agenda points are empty", () => {
      const result = injectRandomAgendaPoint(`Step: ${RANDOM_AGENDA_POINT_PLACEHOLDER}`, []);
      expect(result).toBe(`Step: ${RANDOM_AGENDA_POINT_FALLBACK}`);
    });
  });
});
