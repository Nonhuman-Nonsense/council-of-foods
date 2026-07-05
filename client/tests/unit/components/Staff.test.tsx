import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Staff from '@main/overlay/Staff';
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
  expectedVendorId: '2341',
  scannedPorts: [] as Array<{ path: string; vendorId?: string; productId?: string }>,
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

const mockClaim = vi.fn();
const mockRelease = vi.fn();
const mockSetLed = vi.fn();
const mockSetLedDebugOverlay = vi.fn();
const ledDebugState = { enabled: false };

vi.mock('@/museum/button/buttonDebug', () => ({
  useButtonLedDebugOverlay: () => ({
    ledDebugOverlay: ledDebugState.enabled,
    setLedDebugOverlay: mockSetLedDebugOverlay,
  }),
}));

vi.mock('@/museum/button/useButton', () => ({
  useButtonBridgeHealth: () => bridgeHealthState,
  useButton: () => ({
    claim: mockClaim,
    release: mockRelease,
    setLed: mockSetLed,
    pressed: false,
    isOwner: false,
  }),
  useButtonConnection: () => ({
    bridgeStatus: museumButtonState.bridgeStatus,
    bridgeError: museumButtonState.bridgeError,
    bridgeAvailable: museumButtonState.bridgeAvailable,
    serialConnected: false,
  }),
}));

describe('Staff overlay', () => {
  beforeEach(() => {
    localStorage.clear();
    ledDebugState.enabled = false;
    mockSetLedDebugOverlay.mockClear();
    museumButtonState.bridgeStatus = 'disconnected';
    museumButtonState.bridgeError = null;
    museumButtonState.bridgeAvailable = true;
    bridgeHealthState.status = 'running';
    bridgeHealthState.serial = 'connected';
    bridgeHealthState.path = '/dev/cu.usbmodem1';
    bridgeHealthState.version = '1.0.0';
    bridgeHealthState.serialDetail = 'connected';
    bridgeHealthState.serialMessage = 'Council button connected at /dev/cu.usbmodem1';
    bridgeHealthState.expectedVendorId = '2341';
    bridgeHealthState.scannedPorts = [];
  });

  afterEach(() => {
    museumButtonState.bridgeStatus = 'disconnected';
    museumButtonState.bridgeError = null;
  });

  it('renders title, installation, and agent mode panels', () => {
    render(<Staff />);
    expect(screen.getByText('staff.title')).toBeInTheDocument();
    expect(screen.getByText('staff.panels.installation')).toBeInTheDocument();
    expect(screen.getByText('staff.panels.agentMode')).toBeInTheDocument();
    expect(screen.getByText('staff.web')).toBeInTheDocument();
    expect(screen.getByText('staff.museum')).toBeInTheDocument();
    expect(screen.getByTestId('agent-mode-off')).toBeInTheDocument();
    expect(screen.getByText('agentMode.alwaysOn')).toBeInTheDocument();
    expect(screen.getByText('agentMode.pushToTalk')).toBeInTheDocument();
  });

  it('selects web by default and persists app mode choice', () => {
    render(<Staff />);

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

  it('shows museum switch button toggle below installation mode', () => {
    render(<Staff />);

    const toggle = screen.getByTestId('staff-museum-switch-button-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveTextContent('staff.museumSwitchButton');
  });

  it('persists museum switch button enablement', () => {
    render(<Staff />);

    fireEvent.click(screen.getByTestId('staff-museum-switch-button-toggle'));
    expect(localStorage.getItem('councilMuseumSwitchButtonEnabled')).toBe('true');
  });

  it('clears museum switch button storage when toggled off', () => {
    localStorage.setItem('councilMuseumSwitchButtonEnabled', 'true');

    render(<Staff />);

    fireEvent.click(screen.getByTestId('staff-museum-switch-button-toggle'));
    expect(localStorage.getItem('councilMuseumSwitchButtonEnabled')).toBeNull();
  });

  it('shows museum switch button toggle with red border glow when active', () => {
    localStorage.setItem('councilMuseumSwitchButtonEnabled', 'true');

    render(<Staff />);

    const toggle = screen.getByTestId('staff-museum-switch-button-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveStyle({ borderColor: 'rgb(252, 165, 165)' });
    expect(toggle).not.toHaveStyle({ backgroundColor: 'rgb(239, 68, 68)' });
  });

  it('selects off by default without persisting agent mode', () => {
    render(<Staff />);

    const off = screen.getByTestId('agent-mode-off');
    const alwaysOn = screen.getByTestId('agent-mode-always-on');
    const pushToTalk = screen.getByTestId('agent-mode-ptt');

    expect(off).toHaveClass('selected');
    expect(alwaysOn).not.toHaveClass('selected');
    expect(pushToTalk).not.toHaveClass('selected');
    expect(localStorage.getItem('councilAgentMode')).toBeNull();

    fireEvent.click(pushToTalk);
    expect(localStorage.getItem('councilAgentMode')).toBe('ptt');
    expect(pushToTalk).toHaveClass('selected');

    fireEvent.click(alwaysOn);
    expect(localStorage.getItem('councilAgentMode')).toBe('always-on');
    expect(alwaysOn).toHaveClass('selected');

    fireEvent.click(off);
    expect(localStorage.getItem('councilAgentMode')).toBe('off');
    expect(off).toHaveClass('selected');
  });

  it('hides off in museum mode and coerces to always-on when entering museum', () => {
    render(<Staff />);

    fireEvent.click(screen.getByTestId('app-mode-museum'));

    expect(screen.queryByTestId('agent-mode-off')).not.toBeInTheDocument();
    expect(screen.getByTestId('agent-mode-always-on')).toHaveClass('selected');
    expect(localStorage.getItem('councilAgentMode')).toBe('always-on');
  });

  it('shows split status when push to talk is enabled in museum mode', () => {
    localStorage.setItem('councilAppMode', 'museum');
    localStorage.setItem('councilAgentMode', 'ptt');
    localStorage.setItem('councilPttHardwareEnabled', 'true');
    museumButtonState.bridgeStatus = 'connected';

    render(<Staff />);

    expect(screen.getByTestId('staff-bridge-daemon-status')).toHaveTextContent(
      'staff.button.bridge.running',
    );
    expect(screen.getByTestId('staff-bridge-app-status')).toHaveTextContent(
      'staff.button.app.connected',
    );
    expect(screen.getByTestId('staff-button-usb-status')).toHaveTextContent(
      'staff.button.usb.connected',
    );
  });

  it('maps bridge daemon health to status chips', () => {
    localStorage.setItem('councilAppMode', 'museum');
    localStorage.setItem('councilAgentMode', 'ptt');
    localStorage.setItem('councilPttHardwareEnabled', 'true');
    bridgeHealthState.status = 'checking';
    museumButtonState.bridgeStatus = 'connecting';

    render(<Staff />);
    expect(screen.getByTestId('staff-bridge-daemon-status')).toHaveTextContent(
      'staff.button.bridge.checking',
    );
  });

  it('maps app websocket status independently of usb', () => {
    localStorage.setItem('councilAppMode', 'museum');
    localStorage.setItem('councilAgentMode', 'ptt');
    localStorage.setItem('councilPttHardwareEnabled', 'true');
    bridgeHealthState.serial = 'disconnected';
    bridgeHealthState.path = null;
    museumButtonState.bridgeStatus = 'connecting';

    render(<Staff />);
    expect(screen.getByTestId('staff-bridge-app-status')).toHaveTextContent(
      'staff.button.app.connecting',
    );
  });

  it('shows staff bridge detail lines when hardware is missing', () => {
    localStorage.setItem('councilAppMode', 'museum');
    localStorage.setItem('councilAgentMode', 'ptt');
    localStorage.setItem('councilPttHardwareEnabled', 'true');
    museumButtonState.bridgeStatus = 'connecting';
    bridgeHealthState.serial = 'disconnected';
    bridgeHealthState.path = null;
    bridgeHealthState.serialMessage =
      'No USB serial device with vendor 2341 found (1 other port(s) visible).';
    bridgeHealthState.scannedPorts = [
      { path: '/dev/cu.usbmodem1', vendorId: '239a', productId: '8014' },
    ];

    render(<Staff />);
    fireEvent.click(screen.getByText('staff.panels.details'));

    expect(screen.getByText('Bridge version 1.0.0')).toBeInTheDocument();
    expect(screen.getByText('Looking for USB vendor 2341 (Arduino USB)')).toBeInTheDocument();
    expect(screen.getByText(/Visible USB serial: 239a:8014/)).toBeInTheDocument();
  });

  it('claims the button on mount for hardware debugging', () => {
    mockClaim.mockClear();
    const { unmount } = render(<Staff />);
    expect(mockClaim).toHaveBeenCalled();
    unmount();
    expect(mockRelease).toHaveBeenCalled();
  });

  it('sets pulse LED by default and on while pressed', () => {
    mockSetLed.mockClear();
    render(<Staff />);
    expect(mockSetLed).toHaveBeenCalledWith('pulse');
  });

  it('toggles LED debug overlay when push to talk is enabled', () => {
    localStorage.setItem('councilAgentMode', 'ptt');

    render(<Staff />);

    const toggle = screen.getByTestId('staff-led-debug-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);
    expect(mockSetLedDebugOverlay).toHaveBeenCalledWith(true);
  });

  it('shows hardware toggle when push to talk is enabled', () => {
    localStorage.setItem('councilAgentMode', 'ptt');

    render(<Staff />);

    const toggle = screen.getByTestId('staff-ptt-hardware-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('staff-button-status')).not.toBeInTheDocument();
  });

  it('persists hardware enablement and shows button status panel', () => {
    localStorage.setItem('councilAgentMode', 'ptt');

    render(<Staff />);

    fireEvent.click(screen.getByTestId('staff-ptt-hardware-toggle'));
    expect(localStorage.getItem('councilPttHardwareEnabled')).toBe('true');
    expect(screen.getByTestId('staff-button-status')).toBeInTheDocument();
  });

  it('shows button status panel in web mode when hardware is enabled', () => {
    localStorage.setItem('councilAppMode', 'web');
    localStorage.setItem('councilAgentMode', 'ptt');
    localStorage.setItem('councilPttHardwareEnabled', 'true');
    museumButtonState.bridgeStatus = 'connected';

    render(<Staff />);

    expect(screen.getByTestId('staff-button-status')).toBeInTheDocument();
    expect(screen.getByTestId('staff-bridge-app-status')).toHaveTextContent(
      'staff.button.app.connected',
    );
  });

  it('shows hardware toggle as active when enabled', () => {
    localStorage.setItem('councilAgentMode', 'ptt');
    localStorage.setItem('councilPttHardwareEnabled', 'true');

    render(<Staff />);

    const toggle = screen.getByTestId('staff-ptt-hardware-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveStyle({ backgroundColor: 'rgb(239, 68, 68)' });
  });

  it('hides hardware toggle unless push to talk is enabled', () => {
    render(<Staff />);
    expect(screen.queryByTestId('staff-ptt-hardware-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('staff-led-debug-toggle')).not.toBeInTheDocument();
  });

  it('shows LED preview toggle when push to talk is enabled in production', async () => {
    vi.stubEnv('DEV', false);
    vi.resetModules();
    localStorage.setItem('councilAgentMode', 'ptt');

    const { default: StaffProd } = await import('@main/overlay/Staff');
    render(<StaffProd />);

    expect(screen.getByTestId('staff-led-debug-toggle')).toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it('shows LED preview toggle as active when flag is enabled', () => {
    localStorage.setItem('councilAgentMode', 'ptt');
    ledDebugState.enabled = true;
    render(<Staff />);
    const toggle = screen.getByTestId('staff-led-debug-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveStyle({ backgroundColor: 'rgb(239, 68, 68)' });
  });

  it('persists dev log master switch', () => {
    render(<Staff />);
    expect(screen.getByTestId('staff-dev-log-on')).toHaveClass('selected');
    fireEvent.click(screen.getByTestId('staff-dev-log-off'));
    expect(localStorage.getItem('councilDevLogEnabled')).toBe('false');
  });

  it('toggles a dev log category pill', () => {
    render(<Staff />);
    const api = screen.getByTestId('staff-dev-log-category-API');
    expect(api).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(api);
    expect(localStorage.getItem('councilDevLogDisabledCategories')).toContain('API');
  });

  it('shows usb not detected hint inside details when hardware is missing', () => {
    localStorage.setItem('councilAppMode', 'museum');
    localStorage.setItem('councilAgentMode', 'ptt');
    localStorage.setItem('councilPttHardwareEnabled', 'true');
    museumButtonState.bridgeStatus = 'connecting';
    bridgeHealthState.serial = 'disconnected';
    bridgeHealthState.path = null;

    render(<Staff />);

    fireEvent.click(screen.getByText('staff.panels.details'));
    expect(screen.getByTestId('staff-button-usb-hint')).toBeInTheDocument();
  });
});
