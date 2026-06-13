import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import VoiceGuideOverlay from '@voice/VoiceGuideOverlay';
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
  default: () => <button type="button" data-testid="voice-guide-ai-toggle">AI</button>,
}));

describe('VoiceGuideOverlay', () => {
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
    render(<VoiceGuideOverlay {...baseProps} isMuseumMode={false} />);
    expect(screen.getByTestId('voice-guide-ai-toggle')).toBeInTheDocument();
  });

  it('hides the AI toggle in museum mode', () => {
    render(<VoiceGuideOverlay {...baseProps} isMuseumMode />);
    expect(screen.queryByTestId('voice-guide-ai-toggle')).not.toBeInTheDocument();
  });
});
