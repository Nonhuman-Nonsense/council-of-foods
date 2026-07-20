import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

vi.mock('@council/ConversationControlIcon', () => ({
  default: () => <button type="button" data-testid="setup-agent-ai-toggle">AI</button>,
}));

describe('SetupAgentOverlay', () => {
  const baseProps = {
    isConnecting: false,
    error: null,
    lastCaption: null,
    lastUserTranscript: null,
    muted: false,
    onStart: vi.fn(),
    onStop: vi.fn(),
  };

  it('shows the AI toggle in web mode', () => {
    render(<SetupAgentOverlay {...baseProps} isMuseumMode={false} />);
    expect(screen.getByTestId('setup-agent-ai-toggle')).toBeInTheDocument();
  });

  it('hides the AI toggle in museum mode', () => {
    render(<SetupAgentOverlay {...baseProps} isMuseumMode />);
    expect(screen.queryByTestId('setup-agent-ai-toggle')).not.toBeInTheDocument();
  });
});
