import { describe, it, expect, vi } from "vitest";
import { buildLanguagePath } from "@/routing";

vi.mock("@shared/AvailableLanguages", () => ({
  AVAILABLE_LANGUAGES: ["en"],
  GOOGLE_LANGUAGE_MAP: { en: "en-GB" },
  SUPPORTED_LOCALES: ["en-US", "en-GB", "en-AU", "en-IN"],
}));

describe("buildLanguagePath (single-language deploy)", () => {
  it("returns paths without a language prefix", () => {
    expect(buildLanguagePath("en", "/new-meeting", "#about")).toBe("/new-meeting#about");
    expect(buildLanguagePath("en", "/", "")).toBe("/");
  });
});
