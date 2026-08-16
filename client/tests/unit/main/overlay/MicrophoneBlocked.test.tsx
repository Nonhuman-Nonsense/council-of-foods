import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MicrophoneBlocked from "@main/overlay/MicrophoneBlocked";
import { setMicAvailability, useMicAvailabilityStore } from "@realtime/micAvailabilityStore";
import type { MicrophoneErrorReason } from "@realtime/realtimeConnection";
import "@testing-library/jest-dom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("MicrophoneBlocked", () => {
  beforeEach(() => {
    useMicAvailabilityStore.getState().resetForTests();
  });

  it("explains the actual reason the mic is missing", () => {
    // Telling someone to change a permission when the mic is simply unplugged
    // (or held by Zoom) sends them hunting through settings for nothing.
    const cases: Array<[MicrophoneErrorReason, string]> = [
      ["permission_denied", "microphone.blocked"],
      ["not_found", "microphone.noDevice"],
      ["in_use", "microphone.inUse"],
      ["insecure_context", "microphone.unsupported"],
      ["unsupported", "microphone.unsupported"],
      ["unknown", "microphone.blocked"],
    ];

    for (const [reason, expected] of cases) {
      setMicAvailability("unavailable", reason);
      const { unmount } = render(<MicrophoneBlocked onDismiss={vi.fn()} />);

      expect(screen.getByRole("heading", { level: 4 }), reason).toHaveTextContent(expected);
      unmount();
    }
  });

  it("dismisses on the confirm button", () => {
    const onDismiss = vi.fn();
    setMicAvailability("unavailable", "permission_denied");

    render(<MicrophoneBlocked onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button"));

    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
