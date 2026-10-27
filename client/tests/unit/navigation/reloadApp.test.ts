import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "i18next";
import * as AvailableLanguagesModule from "@shared/AvailableLanguages";
import { buildLanguagePath, reloadApp, restartNow } from "@/navigation";
import { useErrorStore } from "@main/overlay/errorStore";

const mockGetAppMode = vi.hoisted(() => vi.fn(() => "web" as "web" | "museum"));

vi.mock("@/settings/councilSettings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/settings/councilSettings")>();
  return {
    ...actual,
    getCapabilities: () => ({ installationReload: mockGetAppMode() !== "web" }),
  };
});

describe("reloadApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useErrorStore.getState().resetForTests();
    mockGetAppMode.mockReturnValue("web");

    const hrefSetter = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location },
      writable: true,
    });
    Object.defineProperty(window.location, "href", {
      set: hrefSetter,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("navigates to the web language root for the current deployment", async () => {
    const hrefSetter = vi.fn();
    Object.defineProperty(window.location, "href", {
      set: hrefSetter,
      configurable: true,
    });

    await expect(reloadApp()).resolves.toBe(true);

    expect(hrefSetter).toHaveBeenCalledWith(buildLanguagePath(i18n.language, "/"));
    expect(useErrorStore.getState().unrecoverableError).toBeNull();
  });

  it("navigates to the current language root in web mode", async () => {
    // Deliberately exercises a future multi-language state; AVAILABLE_LANGUAGES is
    // readonly ["en"] today, so this intentionally overrides the type contract.
    vi.spyOn(AvailableLanguagesModule, "AVAILABLE_LANGUAGES", "get").mockReturnValue(
      ["en", "de"] as unknown as readonly ["en"],
    );

    const hrefSetter = vi.fn();
    Object.defineProperty(window.location, "href", {
      set: hrefSetter,
      configurable: true,
    });

    await expect(reloadApp()).resolves.toBe(true);

    expect(hrefSetter).toHaveBeenCalledWith("/en/");
  });

  it("probes then navigates to / in museum mode when healthy", async () => {
    vi.useFakeTimers();
    mockGetAppMode.mockReturnValue("museum");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 200 })),
    );

    const hrefSetter = vi.fn();
    Object.defineProperty(window.location, "href", {
      set: hrefSetter,
      configurable: true,
    });

    await expect(reloadApp()).resolves.toBe(true);

    expect(fetch).toHaveBeenCalledWith("/health", expect.objectContaining({ cache: "no-store" }));
    expect(hrefSetter).toHaveBeenCalledWith("/");
    expect(useErrorStore.getState().unrecoverableError).toBeNull();
  });

  it("escalates to unrecoverable error in museum mode when probe fails", async () => {
    mockGetAppMode.mockReturnValue("museum");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 503 })),
    );

    const hrefSetter = vi.fn();
    Object.defineProperty(window.location, "href", {
      set: hrefSetter,
      configurable: true,
    });

    await expect(reloadApp()).resolves.toBe(false);

    expect(hrefSetter).not.toHaveBeenCalled();
    expect(useErrorStore.getState().unrecoverableError).toMatchObject({
      source: "reload",
    });
  });

  it("does not replace an existing unrecoverable error when probe fails", async () => {
    mockGetAppMode.mockReturnValue("museum");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 503 })),
    );
    useErrorStore.getState().setUnrecoverableError({
      message: "existing",
      source: "autoplay",
    });

    await expect(reloadApp()).resolves.toBe(false);

    expect(useErrorStore.getState().unrecoverableError).toMatchObject({
      message: "existing",
      source: "autoplay",
    });
  });
});

describe("restartNow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // A meeting link that failed to load is worth loading again for the visitor who followed
  // it; an installation resets to its root regardless, so the next visitor starts fresh.
  it.each([
    { mode: "web", inPlace: true, reloads: true, href: undefined },
    { mode: "web", inPlace: false, reloads: false, href: buildLanguagePath(i18n.language, "/") },
    { mode: "museum", inPlace: true, reloads: false, href: "/" },
  ] as const)("$mode, inPlace=$inPlace → reload=$reloads, href=$href", ({ mode, inPlace, reloads, href }) => {
    mockGetAppMode.mockReturnValue(mode);
    const reload = vi.fn();
    const hrefSetter = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload },
      writable: true,
    });
    Object.defineProperty(window.location, "href", { set: hrefSetter, configurable: true });

    restartNow({ inPlace });

    expect(reload).toHaveBeenCalledTimes(reloads ? 1 : 0);
    if (href === undefined) expect(hrefSetter).not.toHaveBeenCalled();
    else expect(hrefSetter).toHaveBeenCalledWith(href);
  });
});
