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
});
