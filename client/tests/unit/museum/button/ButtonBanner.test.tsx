import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import ButtonBanner from "@/museum/button/ButtonBanner";
import { _resetButtonStoreForTests, useButtonStore } from "@/museum/button/buttonStore";

vi.mock("@/utils", () => ({
  useMobile: () => false,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

vi.mock("@/routing", () => ({
  useRouting: () => ({ rootPath: "/" }),
}));

function renderBanner() {
  return render(
    <MemoryRouter>
      <ButtonBanner />
    </MemoryRouter>,
  );
}

describe("ButtonBanner", () => {
  beforeEach(() => {
    _resetButtonStoreForTests();
  });

  afterEach(() => {
    _resetButtonStoreForTests();
  });

  it("renders the global banner when activeButtonBanner is true", () => {
    useButtonStore.setState({ activeButtonBanner: true });

    renderBanner();
    expect(screen.getByTestId("button-banner")).toBeInTheDocument();
  });

  it("hides the banner when activeButtonBanner is false", () => {
    useButtonStore.setState({ activeButtonBanner: false });

    renderBanner();
    expect(screen.queryByTestId("button-banner")).not.toBeInTheDocument();
  });

  it("uses the routed owner banner message key when set", () => {
    useButtonStore.setState({
      activeButtonBanner: true,
      buttonOwner: "summary",
      bannerMessageKeys: { summary: "summary.banner.pressToRestart" },
    });

    renderBanner();
    expect(screen.getAllByText("summary.banner.pressToRestart").length).toBeGreaterThan(0);
  });

  it("renders replay banner content from the store", () => {
    useButtonStore.setState({
      activeButtonBanner: true,
      buttonOwner: "replay",
      bannerContent: {
        replay: {
          kind: "replay",
          meetingId: 42,
          meetingTitle: "Cheese",
          meetingDate: "January 1, 2026",
          variant: "default",
          isPaused: false,
        },
      },
    });

    renderBanner();
    expect(screen.getByTestId("button-banner")).toBeInTheDocument();
    expect(screen.getAllByText(/replay\.preamble/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/replay\.click/).length).toBeGreaterThan(0);
  });
});
