import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Setup from '@main/overlay/Setup';
import '@testing-library/jest-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('@/utils', () => ({
  useMobile: () => false,
  useMobileXs: () => false,
}));

describe('Setup overlay', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders title and voice guide options', () => {
    render(<Setup />);
    expect(screen.getByText('setupTitle')).toBeInTheDocument();
    expect(screen.getByText('voiceGuide')).toBeInTheDocument();
    expect(screen.getByText('alwaysOn')).toBeInTheDocument();
    expect(screen.getByText('pushToTalk')).toBeInTheDocument();
  });

  it('selects always on by default and persists push to talk choice', () => {
    render(<Setup />);

    const alwaysOn = screen.getByTestId('voice-guide-always-on');
    const pushToTalk = screen.getByTestId('voice-guide-push-to-talk');

    expect(alwaysOn).toHaveClass('selected');
    expect(pushToTalk).not.toHaveClass('selected');

    fireEvent.click(pushToTalk);
    expect(localStorage.getItem('councilPushToTalk')).toBe('true');
    expect(pushToTalk).toHaveClass('selected');
    expect(alwaysOn).not.toHaveClass('selected');

    fireEvent.click(alwaysOn);
    expect(localStorage.getItem('councilPushToTalk')).toBe('false');
    expect(alwaysOn).toHaveClass('selected');
  });
});
