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
    isReady: true,
    lastCaption: null,
    lastUserTranscript: null,
    muted: false,
    onStart: vi.fn(),
    onStop: vi.fn(),
    onToggleMic: vi.fn(),
  };

  it('offers a volume toggle in web mode', () => {
    render(<SetupAgentOverlay {...baseProps} isMuseumMode={false} />);
    expect(screen.getByTestId('icon-volume_on')).toBeInTheDocument();
  });

  it('hides the volume toggle in museum mode', () => {
    render(<SetupAgentOverlay {...baseProps} isMuseumMode />);
    expect(screen.queryByTestId('icon-volume_on')).not.toBeInTheDocument();
    expect(screen.queryByTestId('icon-volume_off')).not.toBeInTheDocument();
  });

  it('turns the agent off and back on from the volume toggle', () => {
    const onStop = vi.fn();
    const onStart = vi.fn();

    const { rerender } = render(
      <SetupAgentOverlay {...baseProps} onStop={onStop} onStart={onStart} muted={false} />,
    );
    fireEvent.click(screen.getByTestId('icon-volume_on'));
    expect(onStop).toHaveBeenCalledOnce();

    rerender(<SetupAgentOverlay {...baseProps} onStop={onStop} onStart={onStart} muted />);
    fireEvent.click(screen.getByTestId('icon-volume_off'));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('shows the right mic button state for the session', () => {
    const cases: Array<{ muted: boolean; isReady: boolean; micOn: boolean; expected: string }> = [
      // Off is a real state, not a pending one: the click restarts everything,
      // so it stays clickable even though the session is not ready.
      { muted: true, isReady: false, micOn: false, expected: 'off' },
      // Only a live session that hasn't finished connecting waits.
      { muted: false, isReady: false, micOn: false, expected: 'connecting' },
      { muted: false, isReady: true, micOn: false, expected: 'off' },
      { muted: false, isReady: true, micOn: true, expected: 'on' },
    ];

    for (const { muted, isReady, micOn, expected } of cases) {
      const { unmount } = render(
        <SetupAgentOverlay {...baseProps} muted={muted} isReady={isReady} micOn={micOn} />,
      );

      expect(
        screen.getByTestId('realtime-mic-button'),
        `muted=${muted} ready=${isReady} micOn=${micOn}`,
      ).toHaveAttribute('data-mic-state', expected);
      unmount();
    }
  });

  it('does not render a clickable mic button in museum mode', () => {
    render(<SetupAgentOverlay {...baseProps} isMuseumMode agentMode="ptt" />);

    expect(screen.queryByTestId('realtime-mic-button')).not.toBeInTheDocument();
  });
});
