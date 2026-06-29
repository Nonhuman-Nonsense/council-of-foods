import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import {
  AGENT_MODE_STORAGE_KEY,
  APP_MODE_STORAGE_KEY,
  setAgentMode,
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
  getAgentMode,
} from "@/settings/councilSettings";

function SettingsProbe() {
  const {
    mode,
    isMuseumMode,
    setAppMode: updateAppMode,
    agentMode,
    setAgentMode: updateAgentMode,
  } = useCouncilSettings();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="museum">{String(isMuseumMode)}</span>
      <span data-testid="agent-mode">{agentMode}</span>
      <button type="button" onClick={() => updateAppMode("web")}>
        to-web
      </button>
      <button type="button" onClick={() => updateAgentMode("ptt")}>
        to-ptt
      </button>
    </div>
  );
}

describe("councilSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("agent mode storage", () => {
    it("defaults to off when unset without writing storage", () => {
      expect(getAgentMode()).toBe("off");
      expect(localStorage.getItem(AGENT_MODE_STORAGE_KEY)).toBeNull();
    });

    it("persists explicit agent mode", () => {
      setAgentMode("ptt");
      expect(localStorage.getItem(AGENT_MODE_STORAGE_KEY)).toBe("ptt");
      expect(getAgentMode()).toBe("ptt");
    });

    it("coerces off to always-on when switching to museum", () => {
      setAppMode("museum");
      expect(getAgentMode()).toBe("always-on");
      expect(localStorage.getItem(AGENT_MODE_STORAGE_KEY)).toBe("always-on");
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

    it("syncs agent mode across hook instances via custom event", async () => {
      render(
        <>
          <SettingsProbe />
          <SettingsProbe />
        </>,
      );

      const agentModes = screen.getAllByTestId("agent-mode");
      expect(agentModes[0]).toHaveTextContent("off");
      expect(agentModes[1]).toHaveTextContent("off");

      act(() => {
        setAgentMode("ptt");
      });

      await waitFor(() => {
        expect(agentModes[0]).toHaveTextContent("ptt");
        expect(agentModes[1]).toHaveTextContent("ptt");
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

    it("updates agent mode when setAgentMode is called from a hook", () => {
      render(<SettingsProbe />);

      expect(screen.getByTestId("agent-mode")).toHaveTextContent("off");
      fireEvent.click(screen.getByRole("button", { name: "to-ptt" }));
      expect(screen.getByTestId("agent-mode")).toHaveTextContent("ptt");
    });
  });
});
