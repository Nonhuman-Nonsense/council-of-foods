import { describe, it, expect, beforeEach } from "vitest";
import {
  DEV_LOG_DISABLED_CATEGORIES_KEY,
  DEV_LOG_ENABLED_KEY,
  getDevLogCategoryStates,
  getDevLogEnabled,
  isDevLogCategoryEnabled,
  setAllDevLogCategories,
  setDevLogCategoryEnabled,
  setDevLogEnabled,
} from "@/settings/councilSettings";

describe("councilSettings dev log", () => {
  beforeEach(() => {
    localStorage.clear();
  });

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
