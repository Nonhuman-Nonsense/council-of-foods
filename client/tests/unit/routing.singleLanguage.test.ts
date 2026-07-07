import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildLanguagePath, useSwitchLanguage } from "@/navigation";

const navigate = vi.fn();

vi.mock("@shared/AvailableLanguages", () => ({
  AVAILABLE_LANGUAGES: ["en"],
}));

vi.mock("react-router", () => ({
  useNavigate: () => navigate,
  useLocation: () => ({
    pathname: "/new-meeting",
    hash: "#about",
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "en" } }),
}));

beforeEach(() => {
  navigate.mockClear();
});

describe("buildLanguagePath (single-language deploy)", () => {
  it("returns paths without a language prefix", () => {
    expect(buildLanguagePath("en", "/new-meeting", "#about")).toBe("/new-meeting#about");
    expect(buildLanguagePath("en", "/", "")).toBe("/");
  });
});

describe("useSwitchLanguage (single-language deploy)", () => {
  it("reports no other languages and does not navigate", () => {
    const { result } = renderHook(() => useSwitchLanguage());

    expect(result.current.canSwitchLanguage).toBe(false);
    expect(result.current.otherLanguages).toEqual([]);

    result.current.switchLanguage("sv");
    expect(navigate).not.toHaveBeenCalled();
  });
});
