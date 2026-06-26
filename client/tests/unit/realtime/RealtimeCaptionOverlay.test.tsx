import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RealtimeCaptionOverlay from "@realtime/RealtimeCaptionOverlay";
import "@testing-library/jest-dom";

vi.mock("@/utils", () => ({
  useMobile: () => false,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@council/humanInput/LiveAudioVisualizer", () => ({
  LiveAudioVisualizerPair: () => <div data-testid="live-audio-viz" />,
}));

describe("RealtimeCaptionOverlay", () => {
  it("renders user transcript above agent caption", () => {
    render(
      <RealtimeCaptionOverlay
        error={null}
        lastUserTranscript="What topics are available?"
        lastCaption="We can discuss forests or oceans."
      />,
    );

    const user = screen.getByTestId("voice-guide-user");
    const caption = screen.getByTestId("voice-guide-caption");
    expect(user).toHaveTextContent("What topics are available?");
    expect(caption).toHaveTextContent("We can discuss forests or oceans.");
    expect(user.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders agent caption without user line", () => {
    render(
      <RealtimeCaptionOverlay
        error={null}
        lastUserTranscript={null}
        lastCaption="Hello, welcome to the council."
      />,
    );

    expect(screen.queryByTestId("voice-guide-user")).not.toBeInTheDocument();
    expect(screen.getByTestId("voice-guide-caption")).toHaveTextContent(
      "Hello, welcome to the council.",
    );
  });

  it("shows error alert when error is set", () => {
    render(
      <RealtimeCaptionOverlay
        error="Connection lost"
        lastCaption={null}
        lastUserTranscript={null}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Connection lost");
  });

  it("shows hold-to-speak banner in PTT mode when hint is visible", () => {
    render(
      <RealtimeCaptionOverlay
        error={null}
        lastCaption={null}
        lastUserTranscript={null}
        pushToTalkMode
        showHoldToSpeakHint
      />,
    );

    expect(screen.getByTestId("voice-guide-hold-to-speak")).toBeInTheDocument();
  });

  it("hides hold-to-speak banner when not in PTT mode", () => {
    render(
      <RealtimeCaptionOverlay
        error={null}
        lastCaption={null}
        lastUserTranscript={null}
        showHoldToSpeakHint
      />,
    );

    expect(screen.queryByTestId("voice-guide-hold-to-speak")).not.toBeInTheDocument();
  });

  it("reserves PTT viz row when showPttVisualizer is true", () => {
    render(
      <RealtimeCaptionOverlay
        error={null}
        lastCaption={null}
        lastUserTranscript={null}
        showPttVisualizer
        micActive={false}
      />,
    );

    expect(screen.getByTestId("realtime-ptt-viz-row")).toBeInTheDocument();
    expect(screen.queryByTestId("live-audio-viz")).not.toBeInTheDocument();
  });

  it("shows visualizer when PTT mic is active and stream is present", () => {
    render(
      <RealtimeCaptionOverlay
        error={null}
        lastCaption={null}
        lastUserTranscript={null}
        showPttVisualizer
        micActive
        micStream={{ id: "mock" } as MediaStream}
      />,
    );

    expect(screen.getByTestId("live-audio-viz")).toBeInTheDocument();
  });

  it("uses council subtitle layout marker", () => {
    const { container } = render(
      <RealtimeCaptionOverlay
        error={null}
        lastCaption="Council size caption"
        lastUserTranscript={null}
        subtitleLayout="council"
      />,
    );

    expect(container.querySelector('[data-subtitle-layout="council"]')).toBeInTheDocument();
    expect(screen.getByTestId("voice-guide-caption")).toHaveStyle({ fontSize: "25px" });
  });

  it("uses compact subtitle layout marker and bumped positioning", () => {
    const { container } = render(
      <RealtimeCaptionOverlay
        error={null}
        lastCaption="Compact caption"
        lastUserTranscript={null}
        subtitleLayout="compact"
      />,
    );

    const root = container.querySelector('[data-subtitle-layout="compact"]') as HTMLElement;
    expect(root).toBeInTheDocument();
    expect(root).toHaveStyle({ bottom: "64px" });
    expect(screen.getByTestId("voice-guide-caption")).toHaveStyle({ fontSize: "20px" });
  });
});
