import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildLanguagePath, useSwitchLanguage } from "@/routing";

const navigate = vi.fn();

vi.mock("@shared/AvailableLanguages", () => ({
  AVAILABLE_LANGUAGES: ["en", "sv"],
  GOOGLE_LANGUAGE_MAP: { en: "en-GB", sv: "sv-SE" },
  SUPPORTED_LOCALES: ["en-US", "en-GB", "en-AU", "en-IN"],
}));

vi.mock("react-router", () => ({
  useNavigate: () => navigate,
  useLocation: () => ({
    pathname: "/en/new-meeting",
    hash: "#about",
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "en" } }),
}));

beforeEach(() => {
  navigate.mockClear();
});

describe("buildLanguagePath (multi-language deploy)", () => {
  it("switches language while preserving route and hash", () => {
    expect(buildLanguagePath("sv", "/en/new-meeting", "#about")).toBe("/sv/new-meeting#about");
  });

  it("handles root paths", () => {
    expect(buildLanguagePath("sv", "/en/", "")).toBe("/sv/");
    expect(buildLanguagePath("en", "/sv/", "")).toBe("/en/");
  });

  it("handles paths without a trailing slash", () => {
    expect(buildLanguagePath("sv", "/en", "")).toBe("/sv/");
  });

  it("adds a hash prefix when missing", () => {
    expect(buildLanguagePath("sv", "/en/new-meeting", "about")).toBe("/sv/new-meeting#about");
  });
});

describe("useSwitchLanguage (multi-language deploy)", () => {
  it("exposes other languages and navigates to the target language", () => {
    const { result } = renderHook(() => useSwitchLanguage());

    expect(result.current.canSwitchLanguage).toBe(true);
    expect(result.current.currentLang).toBe("en");
    expect(result.current.otherLanguages).toEqual(["sv"]);

    result.current.switchLanguage("sv");
    expect(navigate).toHaveBeenCalledWith("/sv/new-meeting#about");
  });

  it("ignores invalid or current language targets", () => {
    const { result } = renderHook(() => useSwitchLanguage());

    result.current.switchLanguage("en");
    result.current.switchLanguage("de");
    expect(navigate).not.toHaveBeenCalled();
  });
});
