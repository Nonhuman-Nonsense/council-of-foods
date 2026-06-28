import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import {
  APP_MODE_STORAGE_KEY,
  setAppMode,
  setPushToTalk,
  useCouncilSettings,
  DEV_LOG_DISABLED_CATEGORIES_KEY,
  DEV_LOG_ENABLED_KEY,
  getDevLogCategoryStates,
  getDevLogEnabled,
  isDevLogCategoryEnabled,
  setAllDevLogCategories,
  setDevLogCategoryEnabled,
  setDevLogEnabled,
} from "@/settings/councilSettings";

function SettingsProbe() {
  const {
    mode,
    isMuseumMode,
    setAppMode: updateAppMode,
    pushToTalkMode,
    setPushToTalkMode,
  } = useCouncilSettings();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="museum">{String(isMuseumMode)}</span>
      <span data-testid="ptt">{String(pushToTalkMode)}</span>
      <button type="button" onClick={() => updateAppMode("web")}>
        to-web
      </button>
      <button type="button" onClick={() => setPushToTalkMode(true)}>
        enable-ptt
      </button>
    </div>
  );
}

describe("councilSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("dev log storage", () => {
    it("defaults dev log to enabled in vitest/dev", () => {
      expect(getDevLogEnabled()).toBe(true);
    });

    it("persists master dev log switch", () => {
      setDevLogEnabled(false);
      expect(localStorage.getItem(DEV_LOG_ENABLED_KEY)).toBe("false");
      expect(getDevLogEnabled()).toBe(false);
    });

    it("disables individual categories", () => {
      setDevLogCategoryEnabled("API", false);
      expect(isDevLogCategoryEnabled("API")).toBe(false);
      expect(isDevLogCategoryEnabled("SOCKET")).toBe(true);
      expect(getDevLogCategoryStates().API).toBe(false);
    });

    it("setAllDevLogCategories disables every category", () => {
      setAllDevLogCategories(false);
      expect(getDevLogCategoryStates().API).toBe(false);
      expect(getDevLogCategoryStates().ERROR).toBe(false);
      expect(localStorage.getItem(DEV_LOG_DISABLED_CATEGORIES_KEY)).toContain("API");
    });

    it("setAllDevLogCategories true clears disabled list", () => {
      setAllDevLogCategories(false);
      setAllDevLogCategories(true);
      expect(isDevLogCategoryEnabled("API")).toBe(true);
      expect(localStorage.getItem(DEV_LOG_DISABLED_CATEGORIES_KEY)).toBe("[]");
    });
  });

  describe("useCouncilSettings", () => {
    it("syncs app mode across hook instances via custom event", async () => {
      render(
        <>
          <SettingsProbe />
          <SettingsProbe />
        </>,
      );

      const modes = screen.getAllByTestId("mode");
      expect(modes[0]).toHaveTextContent("web");
      expect(modes[1]).toHaveTextContent("web");

      act(() => {
        setAppMode("museum");
      });

      await waitFor(() => {
        expect(modes[0]).toHaveTextContent("museum");
        expect(modes[1]).toHaveTextContent("museum");
      });
      expect(screen.getAllByTestId("museum")[0]).toHaveTextContent("true");
    });

    it("syncs push to talk across hook instances via custom event", async () => {
      render(
        <>
          <SettingsProbe />
          <SettingsProbe />
        </>,
      );

      const pttFlags = screen.getAllByTestId("ptt");
      expect(pttFlags[0]).toHaveTextContent("false");
      expect(pttFlags[1]).toHaveTextContent("false");

      act(() => {
        setPushToTalk(true);
      });

      await waitFor(() => {
        expect(pttFlags[0]).toHaveTextContent("true");
        expect(pttFlags[1]).toHaveTextContent("true");
      });
    });

    it("updates app mode when setAppMode is called from a hook", () => {
      localStorage.setItem(APP_MODE_STORAGE_KEY, "museum");
      render(<SettingsProbe />);

      expect(screen.getByTestId("mode")).toHaveTextContent("museum");
      fireEvent.click(screen.getByRole("button", { name: "to-web" }));
      expect(screen.getByTestId("mode")).toHaveTextContent("web");
      expect(localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe("web");
    });

    it("updates push to talk when setPushToTalkMode is called from a hook", () => {
      render(<SettingsProbe />);

      expect(screen.getByTestId("ptt")).toHaveTextContent("false");
      fireEvent.click(screen.getByRole("button", { name: "enable-ptt" }));
      expect(screen.getByTestId("ptt")).toHaveTextContent("true");
    });
  });
});
