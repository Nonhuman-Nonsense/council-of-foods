import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import {
  APP_MODE_STORAGE_KEY,
  clearRetiredSettings,
  setAppMode,
  useCouncilSettings,
  DEV_LOG_DISABLED_CATEGORIES_KEY,
  DEV_LOG_ENABLED_KEY,
  getDevLogCategoryStates,
  getDevLogEnabled,
  isDevLogCategoryEnabled,
  setAllDevLogCategories,
  setDevLogCategoryEnabled,
  setDevLogEnabled,
  PTT_HARDWARE_ENABLED_KEY,
  getPttHardwareEnabled,
  setPttHardwareEnabled,
  MUSEUM_SWITCH_BUTTON_ENABLED_KEY,
  getMuseumSwitchButtonEnabled,
  setMuseumSwitchButtonEnabled,
} from "@/settings/councilSettings";

function SettingsProbe() {
  const {
    mode,
    isMuseumMode,
    setAppMode: updateAppMode,
    capabilities,
    pttHardwareEnabled,
    setPttHardwareEnabled: updatePttHardware,
  } = useCouncilSettings();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="museum">{String(isMuseumMode)}</span>
      <span data-testid="meta-agent">{String(capabilities.metaAgent)}</span>
      <span data-testid="ptt-hardware">{String(pttHardwareEnabled)}</span>
      <button type="button" onClick={() => updateAppMode("web")}>
        to-web
      </button>
      <button type="button" onClick={() => updatePttHardware(true)}>
        hardware-on
      </button>
    </div>
  );
}

describe("councilSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("retired settings", () => {
    it("drops the stored agent mode so it cannot influence anything", () => {
      localStorage.setItem("councilAgentMode", "ptt");
      clearRetiredSettings();
      expect(localStorage.getItem("councilAgentMode")).toBeNull();
    });
  });

  describe("ptt hardware storage", () => {
    it("defaults to disabled when unset", () => {
      expect(getPttHardwareEnabled()).toBe(false);
      expect(localStorage.getItem(PTT_HARDWARE_ENABLED_KEY)).toBeNull();
    });

    it("persists explicit hardware enablement", () => {
      setPttHardwareEnabled(true);
      expect(localStorage.getItem(PTT_HARDWARE_ENABLED_KEY)).toBe("true");
      expect(getPttHardwareEnabled()).toBe(true);
    });

    it("survives a mode switch — hardware is independent of the install", () => {
      setPttHardwareEnabled(true);
      setAppMode("museum");
      setAppMode("web");
      expect(getPttHardwareEnabled()).toBe(true);
    });
  });

  describe("museum switch button storage", () => {
    it("defaults to disabled when unset", () => {
      expect(getMuseumSwitchButtonEnabled()).toBe(false);
      expect(localStorage.getItem(MUSEUM_SWITCH_BUTTON_ENABLED_KEY)).toBeNull();
    });

    it("persists explicit enablement", () => {
      setMuseumSwitchButtonEnabled(true);
      expect(localStorage.getItem(MUSEUM_SWITCH_BUTTON_ENABLED_KEY)).toBe("true");
      expect(getMuseumSwitchButtonEnabled()).toBe(true);
    });

    it("removes storage key when disabled", () => {
      setMuseumSwitchButtonEnabled(true);
      setMuseumSwitchButtonEnabled(false);
      expect(getMuseumSwitchButtonEnabled()).toBe(false);
      expect(localStorage.getItem(MUSEUM_SWITCH_BUTTON_ENABLED_KEY)).toBeNull();
    });

    it("migrates legacy escape hatch storage key", () => {
      localStorage.setItem("councilEscapeHatchEnabled", "true");
      expect(getMuseumSwitchButtonEnabled()).toBe(true);
      expect(localStorage.getItem(MUSEUM_SWITCH_BUTTON_ENABLED_KEY)).toBe("true");
      expect(localStorage.getItem("councilEscapeHatchEnabled")).toBeNull();
    });
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

    it("derives capabilities from the mode, across hook instances", async () => {
      render(
        <>
          <SettingsProbe />
          <SettingsProbe />
        </>,
      );

      const metaAgent = screen.getAllByTestId("meta-agent");
      expect(metaAgent[0]).toHaveTextContent("false");

      act(() => {
        setAppMode("museum");
      });

      await waitFor(() => {
        expect(metaAgent[0]).toHaveTextContent("true");
        expect(metaAgent[1]).toHaveTextContent("true");
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

    it("syncs ptt hardware across hook instances via custom event", async () => {
      render(
        <>
          <SettingsProbe />
          <SettingsProbe />
        </>,
      );

      const hardwareFlags = screen.getAllByTestId("ptt-hardware");
      expect(hardwareFlags[0]).toHaveTextContent("false");
      expect(hardwareFlags[1]).toHaveTextContent("false");

      act(() => {
        setPttHardwareEnabled(true);
      });

      await waitFor(() => {
        expect(hardwareFlags[0]).toHaveTextContent("true");
        expect(hardwareFlags[1]).toHaveTextContent("true");
      });
    });

    it("updates ptt hardware when setPttHardwareEnabled is called from a hook", () => {
      render(<SettingsProbe />);

      fireEvent.click(screen.getByRole("button", { name: "hardware-on" }));
      expect(screen.getByTestId("ptt-hardware")).toHaveTextContent("true");
      expect(localStorage.getItem(PTT_HARDWARE_ENABLED_KEY)).toBe("true");
    });
  });
});
