import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ButtonBanner from "@/museum/button/ButtonBanner";
import { _resetButtonStoreForTests, useButtonStore } from "@/museum/button/buttonStore";

vi.mock("@/utils", () => ({
  useMobile: () => false,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const agentModeRef = vi.hoisted(() => ({ value: "ptt" as "ptt" | "always-on" }));

vi.mock("@/settings/councilSettings", () => ({
  useCouncilSettings: () => ({
    agentMode: agentModeRef.value,
  }),
}));

describe("ButtonBanner", () => {
  beforeEach(() => {
    agentModeRef.value = "ptt";
    _resetButtonStoreForTests();
  });

  afterEach(() => {
    _resetButtonStoreForTests();
  });

  it("renders nothing when agent mode is not ptt", () => {
    agentModeRef.value = "always-on";
    useButtonStore.setState({ activeButtonBanner: true });

    const { container } = render(<ButtonBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the global banner when activeButtonBanner is true", () => {
    useButtonStore.setState({ activeButtonBanner: true });

    render(<ButtonBanner />);
    expect(screen.getByTestId("button-banner")).toBeInTheDocument();
  });

  it("hides the banner when activeButtonBanner is false", () => {
    useButtonStore.setState({ activeButtonBanner: false });

    render(<ButtonBanner />);
    expect(screen.queryByTestId("button-banner")).not.toBeInTheDocument();
  });
});
