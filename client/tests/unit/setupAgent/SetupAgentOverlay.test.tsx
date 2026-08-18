import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SetupAgentOverlay from '@setupAgent/SetupAgentOverlay';
import '@testing-library/jest-dom';

vi.mock('@/utils', () => ({
  useMobile: () => false,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@council/humanInput/LiveAudioVisualizer', () => ({
  LiveAudioVisualizerPair: () => <div data-testid="live-audio-viz" />,
}));

// Keep the icon identity — which control is which is the thing under test.
vi.mock('@council/ConversationControlIcon', () => ({
  default: ({ icon, onClick }: { icon: string; onClick: () => void }) => (
    <button type="button" data-testid={`icon-${icon}`} onClick={onClick}>
      {icon}
    </button>
  ),
}));

describe('SetupAgentOverlay', () => {
  const baseProps = {
    isConnecting: false,
    lastCaption: null,
    lastUserTranscript: null,
    muted: false,
    onStart: vi.fn(),
    onStop: vi.fn(),
    onToggleMic: vi.fn(),
  };

  it('offers a volume toggle when the visitor has a pointer', () => {
    render(<SetupAgentOverlay {...baseProps} browserUi />);
    expect(screen.getByTestId('icon-volume_on')).toBeInTheDocument();
  });

  it('hides the volume toggle on a kiosk', () => {
    render(<SetupAgentOverlay {...baseProps} />);
    expect(screen.queryByTestId('icon-volume_on')).not.toBeInTheDocument();
    expect(screen.queryByTestId('icon-volume_off')).not.toBeInTheDocument();
  });

  it('turns the agent off and back on from the volume toggle', () => {
    const onStop = vi.fn();
    const onStart = vi.fn();

    const { rerender } = render(
      <SetupAgentOverlay {...baseProps} browserUi onStop={onStop} onStart={onStart} muted={false} />,
    );
    fireEvent.click(screen.getByTestId('icon-volume_on'));
    expect(onStop).toHaveBeenCalledOnce();

    rerender(
      <SetupAgentOverlay {...baseProps} browserUi onStop={onStop} onStart={onStart} muted />,
    );
    fireEvent.click(screen.getByTestId('icon-volume_off'));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('shows the right mic button state for the session', () => {
    const liveStream = {} as MediaStream;
    const cases: Array<{
      muted: boolean;
      isConnecting: boolean;
      micRequested: boolean;
      micStream: MediaStream | null;
      expected: string;
    }> = [
      // Off is a real state, not a pending one: the click restarts everything,
      // so it stays clickable even though the session is not ready.
      { muted: true, isConnecting: false, micRequested: false, micStream: null, expected: 'off' },
      // Not connecting because the page turned out not to be audible yet —
      // spinning here would promise a greeting that nothing is coming for,
      // and hide the button that supplies the gesture to unblock it.
      { muted: false, isConnecting: false, micRequested: false, micStream: null, expected: 'off' },
      // Ready-but-silent still spins, same signal the museum spinner uses —
      // the greeting itself is what a visitor here is waiting to hear.
      { muted: false, isConnecting: true, micRequested: false, micStream: null, expected: 'connecting' },
      // Requested but not yet live: the first press, mid getUserMedia/attach —
      // spins rather than showing "on" for a track that isn't sending yet.
      { muted: false, isConnecting: false, micRequested: true, micStream: null, expected: 'connecting' },
      { muted: false, isConnecting: false, micRequested: true, micStream: liveStream, expected: 'on' },
      { muted: false, isConnecting: false, micRequested: false, micStream: null, expected: 'off' },
    ];

    for (const { muted, isConnecting, micRequested, micStream, expected } of cases) {
      const { unmount } = render(
        <SetupAgentOverlay
          {...baseProps}
          browserUi
          muted={muted}
          isConnecting={isConnecting}
          micRequested={micRequested}
          micStream={micStream}
        />,
      );

      expect(
        screen.getByTestId('realtime-mic-button'),
        `muted=${muted} connecting=${isConnecting} requested=${micRequested} live=${micStream != null}`,
      ).toHaveAttribute('data-mic-state', expected);
      unmount();
    }
  });

  it('shows the visualiser only once the mic is actually live, not on the request alone', () => {
    const { rerender } = render(
      <SetupAgentOverlay {...baseProps} browserUi micRequested />,
    );
    expect(screen.queryByTestId('live-audio-viz')).not.toBeInTheDocument();

    rerender(<SetupAgentOverlay {...baseProps} browserUi micRequested micStream={{} as MediaStream} />);
    expect(screen.getByTestId('live-audio-viz')).toBeInTheDocument();
  });

  it('does not render a clickable mic button without a pointer', () => {
    render(<SetupAgentOverlay {...baseProps} showMicRow />);

    expect(screen.queryByTestId('realtime-mic-button')).not.toBeInTheDocument();
  });
});
