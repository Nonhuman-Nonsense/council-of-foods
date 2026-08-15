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

  it('shows the mic button as ready to click while the agent is off', () => {
    // Off is a real state, not a pending one: the click restarts everything.
    render(<SetupAgentOverlay {...baseProps} muted isReady={false} />);

    expect(screen.getByTestId('realtime-mic-button')).toHaveAttribute('data-mic-state', 'off');
  });

  it('spins the mic button while a live session is not ready yet', () => {
    render(<SetupAgentOverlay {...baseProps} muted={false} isReady={false} />);

    expect(screen.getByTestId('realtime-mic-button')).toHaveAttribute(
      'data-mic-state',
      'connecting',
    );
  });

  it('marks the mic button as on once the visitor is talking', () => {
    render(<SetupAgentOverlay {...baseProps} micOn />);

    expect(screen.getByTestId('realtime-mic-button')).toHaveAttribute('data-mic-state', 'on');
  });

  it('does not render a clickable mic button in museum mode', () => {
    render(<SetupAgentOverlay {...baseProps} isMuseumMode agentMode="ptt" />);

    expect(screen.queryByTestId('realtime-mic-button')).not.toBeInTheDocument();
  });
});
