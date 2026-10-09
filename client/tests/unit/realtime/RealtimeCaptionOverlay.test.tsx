import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
        lastUserTranscript="What topics are available?"
        lastCaption="We can discuss forests or oceans."
      />,
    );

    const user = screen.getByTestId("agent-user");
    const caption = screen.getByTestId("agent-caption");
    expect(user).toHaveTextContent("What topics are available?");
    expect(caption).toHaveTextContent("We can discuss forests or oceans.");
    expect(user.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders agent caption without user line", () => {
    render(
      <RealtimeCaptionOverlay
        lastUserTranscript={null}
        lastCaption="Hello, welcome to the council."
      />,
    );

    expect(screen.queryByTestId("agent-user")).not.toBeInTheDocument();
    expect(screen.getByTestId("agent-caption")).toHaveTextContent(
      "Hello, welcome to the council.",
    );
  });

  it("hides captions when hideCaptions is true", () => {
    render(
      <RealtimeCaptionOverlay
        lastUserTranscript="Old user line"
        lastCaption="Old agent line"
        hideCaptions
      />,
    );

    expect(screen.queryByTestId("agent-user")).not.toBeInTheDocument();
    expect(screen.queryByTestId("agent-caption")).not.toBeInTheDocument();
  });


  it("reserves the mic row when showMicRow is true", () => {
    render(
      <RealtimeCaptionOverlay
        lastCaption={null}
        lastUserTranscript={null}
        showMicRow
        micActive={false}
      />,
    );

    expect(screen.getByTestId("realtime-ptt-viz-row")).toBeInTheDocument();
    expect(screen.queryByTestId("live-audio-viz")).not.toBeInTheDocument();
  });

  it("reserves the same row height when showMicRow is false", () => {
    render(
      <RealtimeCaptionOverlay
        lastCaption={null}
        lastUserTranscript={null}
        showMicRow={false}
        micActive={false}
      />,
    );

    const row = screen.getByTestId("realtime-ptt-viz-row");
    expect(row).toBeInTheDocument();
    expect(row).toHaveStyle({ visibility: "hidden" });
  });

  it("shows visualizer when the mic is active and a stream is present", () => {
    render(
      <RealtimeCaptionOverlay
        lastCaption={null}
        lastUserTranscript={null}
        showMicRow
        micActive
        micStream={{ id: "mock" } as MediaStream}
      />,
    );

    expect(screen.getByTestId("live-audio-viz")).toBeInTheDocument();
  });

  it("keeps the mic button on screen even with the mic off", () => {
    // It is the only affordance for talking, so unlike the museum indicator it
    // can't wait for the mic to already be live.
    render(
      <RealtimeCaptionOverlay
        lastCaption={null}
        lastUserTranscript={null}
        micActive={false}
        micButton={{ state: "off", onPress: vi.fn(), onRelease: vi.fn() }}
      />,
    );

    expect(screen.getByTestId("realtime-ptt-viz-row")).toHaveStyle({ visibility: "visible" });
    expect(screen.getByTestId("realtime-mic-button")).toHaveAttribute("data-mic-state", "off");
  });

  it("ignores presses while the session is still connecting", () => {
    render(
      <RealtimeCaptionOverlay
        lastCaption={null}
        lastUserTranscript={null}
        micButton={{ state: "connecting", onPress: vi.fn(), onRelease: vi.fn() }}
      />,
    );

    const slot = screen.getByTestId("realtime-mic-button");
    expect(slot).toHaveAttribute("data-mic-state", "connecting");
    expect(within(slot).queryByRole("button")).not.toBeInTheDocument();
  });

  it("holds the mic from the centre button: pressed going down, released letting go", () => {
    const onPress = vi.fn();
    const onRelease = vi.fn();
    render(
      <RealtimeCaptionOverlay
        lastCaption={null}
        lastUserTranscript={null}
        micActive
        micButton={{ state: "on", onPress, onRelease }}
      />,
    );
    const button = within(screen.getByTestId("realtime-mic-button")).getByRole("button");

    fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
    expect(onPress).toHaveBeenCalledOnce();
    expect(onRelease).not.toHaveBeenCalled();

    fireEvent.pointerUp(button, { button: 0, pointerId: 1 });
    expect(onRelease).toHaveBeenCalledOnce();
  });

  it("explains that the button is held when given a hint", () => {
    render(
      <RealtimeCaptionOverlay
        lastCaption="Welcome."
        lastUserTranscript={null}
        micButton={{ state: "off", onPress: vi.fn(), onRelease: vi.fn(), hint: "Hold the button down while you talk" }}
      />,
    );

    expect(screen.getByTestId("agent-hold-hint")).toHaveTextContent("Hold the button down while you talk");
  });

  it("leaves the centre slot inert when no mic button is given", () => {
    // Museum meta agent: the hardware button owns the mic, the icon only reports.
    render(
      <RealtimeCaptionOverlay
        lastCaption={null}
        lastUserTranscript={null}
        showMicRow
        micActive
      />,
    );

    expect(screen.queryByTestId("realtime-mic-button")).not.toBeInTheDocument();
  });

  it("uses council subtitle layout marker", () => {
    const { container } = render(
      <RealtimeCaptionOverlay
        lastCaption="Council size caption"
        lastUserTranscript={null}
        subtitleLayout="council"
      />,
    );

    expect(container.querySelector('[data-subtitle-layout="council"]')).toBeInTheDocument();
    expect(screen.getByTestId("agent-caption")).toHaveStyle({ fontSize: "25px" });
  });

  it("uses compact subtitle layout marker", () => {
    const { container } = render(
      <RealtimeCaptionOverlay
        lastCaption="Compact caption"
        lastUserTranscript={null}
        subtitleLayout="compact"
      />,
    );

    const root = container.querySelector('[data-subtitle-layout="compact"]') as HTMLElement;
    expect(root).toBeInTheDocument();
    expect(screen.getByTestId("agent-caption")).toHaveStyle({ fontSize: "20px" });
  });
});
