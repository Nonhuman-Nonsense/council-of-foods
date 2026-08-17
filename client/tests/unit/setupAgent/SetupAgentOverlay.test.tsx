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
    isStarting: false,
    isReady: true,
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
    const cases: Array<{
      muted: boolean;
      isStarting: boolean;
      isReady: boolean;
      micOn: boolean;
      expected: string;
    }> = [
      // Off is a real state, not a pending one: the click restarts everything,
      // so it stays clickable even though the session is not ready.
      { muted: true, isStarting: false, isReady: false, micOn: false, expected: 'off' },
      // Not started because we are still waiting for the gesture that lets the
      // agent be heard. Spinning here would promise a connection that nothing
      // is coming for, and hide the button that would start one.
      { muted: false, isStarting: false, isReady: false, micOn: false, expected: 'off' },
      // Only an attempt actually in flight waits.
      { muted: false, isStarting: true, isReady: false, micOn: false, expected: 'connecting' },
      { muted: false, isStarting: false, isReady: true, micOn: false, expected: 'off' },
      { muted: false, isStarting: false, isReady: true, micOn: true, expected: 'on' },
    ];

    for (const { muted, isStarting, isReady, micOn, expected } of cases) {
      const { unmount } = render(
        <SetupAgentOverlay
          {...baseProps}
          browserUi
          muted={muted}
          isStarting={isStarting}
          isReady={isReady}
          micOn={micOn}
        />,
      );

      expect(
        screen.getByTestId('realtime-mic-button'),
        `muted=${muted} starting=${isStarting} ready=${isReady} micOn=${micOn}`,
      ).toHaveAttribute('data-mic-state', expected);
      unmount();
    }
  });

  it('does not render a clickable mic button without a pointer', () => {
    render(<SetupAgentOverlay {...baseProps} showMicRow />);

    expect(screen.queryByTestId('realtime-mic-button')).not.toBeInTheDocument();
  });
});
