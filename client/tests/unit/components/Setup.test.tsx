import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Setup from '@main/overlay/Setup';
import { usePushToTalkStore } from '@stores/usePushToTalkStore';
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

vi.mock('@/ptt/useBridgeHealth', () => ({
  useBridgeHealth: () => ({
    status: 'running',
    serial: 'connected',
    path: '/dev/cu.usbmodem1',
    version: '1.0.0',
  }),
}));

describe('Setup overlay', () => {
  beforeEach(() => {
    localStorage.clear();
    usePushToTalkStore.setState({
      bridgeStatus: 'disconnected',
      bridgeError: null,
      bridgeAvailable: true,
    });
  });

  afterEach(() => {
    usePushToTalkStore.setState({
      bridgeStatus: 'disconnected',
      bridgeError: null,
    });
  });

  it('renders title, mode, and voice guide options', () => {
    render(<Setup />);
    expect(screen.getByText('setup.title')).toBeInTheDocument();
    expect(screen.getByText('setup.mode')).toBeInTheDocument();
    expect(screen.getByText('setup.web')).toBeInTheDocument();
    expect(screen.getByText('setup.museum')).toBeInTheDocument();
    expect(screen.getByText('setup.voiceGuide')).toBeInTheDocument();
    expect(screen.getByText('setup.alwaysOn')).toBeInTheDocument();
    expect(screen.getByText('setup.pushToTalk')).toBeInTheDocument();
  });

  it('selects web by default and persists app mode choice', () => {
    render(<Setup />);

    const web = screen.getByTestId('app-mode-web');
    const museum = screen.getByTestId('app-mode-museum');

    expect(web).toHaveClass('selected');
    expect(museum).not.toHaveClass('selected');

    fireEvent.click(museum);
    expect(localStorage.getItem('councilAppMode')).toBe('museum');
    expect(museum).toHaveClass('selected');
    expect(web).not.toHaveClass('selected');

    fireEvent.click(web);
    expect(localStorage.getItem('councilAppMode')).toBe('web');
    expect(web).toHaveClass('selected');
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

  it('shows talk button status when push to talk is enabled', () => {
    localStorage.setItem('councilPushToTalk', 'true');
    usePushToTalkStore.setState({ bridgeStatus: 'connected' });

    render(<Setup />);

    expect(screen.getByTestId('setup-talk-button-status')).toHaveTextContent('setup.talkButton.connected');
  });

  it('shows waiting status when bridge is up but button is not connected', () => {
    localStorage.setItem('councilPushToTalk', 'true');

    render(<Setup />);

    expect(screen.getByTestId('setup-talk-button-status')).toHaveTextContent('setup.talkButton.waiting');
  });
});
