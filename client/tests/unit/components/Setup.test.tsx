import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Setup from '@main/overlay/Setup';
import '@testing-library/jest-dom';

const museumButtonState = {
  bridgeStatus: 'disconnected' as 'disconnected' | 'connecting' | 'connected' | 'error',
  bridgeError: null as string | null,
  bridgeAvailable: true,
};

const bridgeHealthState = {
  status: 'running' as const,
  serial: 'connected' as const,
  path: '/dev/cu.usbmodem1',
  version: '1.0.0',
  serialDetail: 'connected' as const,
  serialMessage: 'Council button connected at /dev/cu.usbmodem1',
  expectedVendorId: '239a',
  scannedPorts: [] as Array<{ path: string; vendorId?: string; productId?: string }>,
};

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

vi.mock('@/museum/button/useBridgeHealth', () => ({
  useButtonBridgeHealth: () => bridgeHealthState,
}));

vi.mock('@/museum/button/hooks', () => ({
  useButtonLed: vi.fn(),
  useButtonConnection: () => ({
    bridgeStatus: museumButtonState.bridgeStatus,
    bridgeError: museumButtonState.bridgeError,
    bridgeAvailable: museumButtonState.bridgeAvailable,
    serialConnected: false,
  }),
}));

describe('Setup overlay', () => {
  beforeEach(() => {
    localStorage.clear();
    museumButtonState.bridgeStatus = 'disconnected';
    museumButtonState.bridgeError = null;
    museumButtonState.bridgeAvailable = true;
    bridgeHealthState.status = 'running';
    bridgeHealthState.serial = 'connected';
    bridgeHealthState.path = '/dev/cu.usbmodem1';
  });

  afterEach(() => {
    museumButtonState.bridgeStatus = 'disconnected';
    museumButtonState.bridgeError = null;
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

  it('shows split status when push to talk is enabled in museum mode', () => {
    localStorage.setItem('councilAppMode', 'museum');
    localStorage.setItem('councilPushToTalk', 'true');
    museumButtonState.bridgeStatus = 'connected';

    render(<Setup />);

    expect(screen.getByTestId('setup-bridge-daemon-status')).toHaveTextContent(
      'setup.button.bridge.running',
    );
    expect(screen.getByTestId('setup-bridge-app-status')).toHaveTextContent(
      'setup.button.app.connected',
    );
    expect(screen.getByTestId('setup-button-usb-status')).toHaveTextContent(
      'setup.button.usb.connected',
    );
  });

  it('shows bridge running and usb not detected when no hardware is plugged in', () => {
    localStorage.setItem('councilAppMode', 'museum');
    localStorage.setItem('councilPushToTalk', 'true');
    museumButtonState.bridgeStatus = 'connecting';
    bridgeHealthState.serial = 'disconnected';
    bridgeHealthState.path = null;

    render(<Setup />);

    expect(screen.getByTestId('setup-bridge-daemon-status')).toHaveTextContent(
      'setup.button.bridge.running',
    );
    expect(screen.getByTestId('setup-bridge-app-status')).toHaveTextContent(
      'setup.button.app.connecting',
    );
    expect(screen.getByTestId('setup-button-usb-status')).toHaveTextContent(
      'setup.button.usb.notDetected',
    );
    expect(screen.getByTestId('setup-button-usb-hint')).toBeInTheDocument();
  });
});
