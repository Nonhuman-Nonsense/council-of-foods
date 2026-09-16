import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Staff from '@main/overlay/Staff';
import '@testing-library/jest-dom';
import type { BridgeAlertsHealth, BridgePrintHealth, SerialDetail, UsbPortInfo } from '@museum/button/buttonBridge';

const museumButtonState = {
  bridgeStatus: 'disconnected' as 'disconnected' | 'connecting' | 'connected' | 'error',
  bridgeError: null as string | null,
  bridgeAvailable: true,
};

// Flat test double covering all ButtonBridgeHealthState variants at once (Staff.tsx
// only reads serial/path/etc when status === "running", so leftover fields are harmless).
const bridgeHealthState: {
  status: 'checking' | 'running' | 'not_running' | 'error';
  serial: 'connected' | 'disconnected' | 'probing';
  path: string | null;
  version: string;
  serialDetail: SerialDetail;
  serialMessage: string;
  expectedVendorId: string | null;
  scannedPorts: UsbPortInfo[];
  print: BridgePrintHealth | null;
  alerts: BridgeAlertsHealth | null;
} = {
  status: 'running',
  serial: 'connected',
  path: '/dev/cu.usbmodem1',
  version: '1.0.0',
  serialDetail: 'connected',
  serialMessage: 'Council button connected at /dev/cu.usbmodem1',
  expectedVendorId: '2341',
  scannedPorts: [],
  print: null,
  alerts: null,
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

const mockClaim = vi.fn();
const mockRelease = vi.fn();
const mockSetArmed = vi.fn();
const mockSetArmedDebugOverlay = vi.fn();
const ledDebugState = { enabled: false };

vi.mock('@/museum/button/buttonDebug', () => ({
  useButtonLedDebugOverlay: () => ({
    ledDebugOverlay: ledDebugState.enabled,
    setLedDebugOverlay: mockSetArmedDebugOverlay,
  }),
}));

vi.mock('@/museum/button/useButton', () => ({
  useButtonBridgeHealth: () => bridgeHealthState,
  useButton: () => ({
    claim: mockClaim,
    release: mockRelease,
    setArmed: mockSetArmed,
    pressed: false,
    wantsMic: false,
    isOwner: false,
  }),
  useButtonConnection: () => ({
    bridgeStatus: museumButtonState.bridgeStatus,
    bridgeError: museumButtonState.bridgeError,
    bridgeAvailable: museumButtonState.bridgeAvailable,
    serialConnected: false,
  }),
}));

const mockCreateProtocolPdf = vi.fn();
const mockSendTestPage = vi.fn();

vi.mock('@council/protocol/protocolPdf', () => ({
  createProtocolPdf: (...args: unknown[]) => mockCreateProtocolPdf(...args),
}));

vi.mock('@/museum/print/printClient', () => ({
  sendTestPage: (...args: unknown[]) => mockSendTestPage(...args),
}));

vi.mock('@council/protocol/ProtocolDocument', () => ({
  default: ({ ref, summaryText }: { ref: React.Ref<HTMLDivElement>; summaryText: string }) => (
    <div ref={ref} data-testid="staff-test-page-document">{summaryText}</div>
  ),
}));

const mockFetchAlertVenues = vi.fn();
const mockChooseAlertVenue = vi.fn();
const mockSendTestAlert = vi.fn();

vi.mock('@/museum/print/alertsClient', () => ({
  fetchAlertVenues: (...args: unknown[]) => mockFetchAlertVenues(...args),
  chooseAlertVenue: (...args: unknown[]) => mockChooseAlertVenue(...args),
  sendTestAlert: (...args: unknown[]) => mockSendTestAlert(...args),
}));

describe('Staff overlay', () => {
  beforeEach(() => {
    localStorage.clear();
    ledDebugState.enabled = false;
    mockSetArmedDebugOverlay.mockClear();
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
    bridgeHealthState.print = null;
    bridgeHealthState.alerts = null;
    mockFetchAlertVenues.mockReset();
    mockChooseAlertVenue.mockReset();
    mockSendTestAlert.mockReset();
  });

  afterEach(() => {
    museumButtonState.bridgeStatus = 'disconnected';
    museumButtonState.bridgeError = null;
  });

  it('renders the installation panel: mode row plus the independent staff aids', () => {
    render(<Staff />);
    expect(screen.getByText('staff.title')).toBeInTheDocument();
    expect(screen.getByText('staff.panels.installation')).toBeInTheDocument();
    expect(screen.getByText('staff.web')).toBeInTheDocument();
    expect(screen.getByText('staff.museum')).toBeInTheDocument();
    expect(screen.getByText('staff.presenter')).toBeInTheDocument();
    expect(screen.getByTestId('staff-mode-switch-button-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('staff-ptt-hardware-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('staff-led-debug-toggle')).toBeInTheDocument();
  });

  it('selects web by default and persists app mode choice', () => {
    render(<Staff />);

    const web = screen.getByTestId('app-mode-web');
    const museum = screen.getByTestId('app-mode-museum');
    const presenter = screen.getByTestId('app-mode-presenter');

    expect(web).toHaveClass('selected');
    expect(museum).not.toHaveClass('selected');
    expect(presenter).not.toHaveClass('selected');

    fireEvent.click(museum);
    expect(localStorage.getItem('councilAppMode')).toBe('museum');
    expect(museum).toHaveClass('selected');
    expect(web).not.toHaveClass('selected');

    fireEvent.click(presenter);
    expect(localStorage.getItem('councilAppMode')).toBe('presenter');
    expect(presenter).toHaveClass('selected');
    expect(museum).not.toHaveClass('selected');

    fireEvent.click(web);
    expect(localStorage.getItem('councilAppMode')).toBe('web');
    expect(web).toHaveClass('selected');
  });

  it('shows museum switch button toggle below installation mode', () => {
    render(<Staff />);

    const toggle = screen.getByTestId('staff-mode-switch-button-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveTextContent('staff.modeSwitchButton');
  });

  it('persists museum switch button enablement', () => {
    render(<Staff />);

    fireEvent.click(screen.getByTestId('staff-mode-switch-button-toggle'));
    expect(localStorage.getItem('councilModeSwitchButtonEnabled')).toBe('true');
  });

  it('clears museum switch button storage when toggled off', () => {
    localStorage.setItem('councilModeSwitchButtonEnabled', 'true');

    render(<Staff />);

    fireEvent.click(screen.getByTestId('staff-mode-switch-button-toggle'));
    expect(localStorage.getItem('councilModeSwitchButtonEnabled')).toBeNull();
  });

  it('shows museum switch button toggle with red border glow when active', () => {
    localStorage.setItem('councilModeSwitchButtonEnabled', 'true');

    render(<Staff />);

    const toggle = screen.getByTestId('staff-mode-switch-button-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveStyle({ borderColor: 'rgb(252, 165, 165)' });
    expect(toggle).not.toHaveStyle({ backgroundColor: 'rgb(239, 68, 68)' });
  });

  it('shows split status when push to talk is enabled in museum mode', () => {
    localStorage.setItem('councilAppMode', 'museum');
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

  it('arms the button so staff can test a press', () => {
    mockSetArmed.mockClear();
    render(<Staff />);
    expect(mockSetArmed).toHaveBeenCalledWith(true);
  });

  it('toggles LED debug overlay when push to talk is enabled', () => {

    render(<Staff />);

    const toggle = screen.getByTestId('staff-led-debug-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);
    expect(mockSetArmedDebugOverlay).toHaveBeenCalledWith(true);
  });

  it('shows hardware toggle when push to talk is enabled', () => {

    render(<Staff />);

    const toggle = screen.getByTestId('staff-ptt-hardware-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('staff-bridge-panel')).not.toBeInTheDocument();
  });

  it('persists hardware enablement and shows button status panel', () => {

    render(<Staff />);

    fireEvent.click(screen.getByTestId('staff-ptt-hardware-toggle'));
    expect(localStorage.getItem('councilPttHardwareEnabled')).toBe('true');
    expect(screen.getByTestId('staff-bridge-panel')).toBeInTheDocument();
  });

  it('shows button status panel in web mode when hardware is enabled', () => {
    localStorage.setItem('councilAppMode', 'web');
    localStorage.setItem('councilPttHardwareEnabled', 'true');
    museumButtonState.bridgeStatus = 'connected';

    render(<Staff />);

    expect(screen.getByTestId('staff-bridge-panel')).toBeInTheDocument();
    expect(screen.getByTestId('staff-bridge-app-status')).toHaveTextContent(
      'staff.button.app.connected',
    );
  });

  it('shows hardware toggle as active when enabled', () => {
    localStorage.setItem('councilPttHardwareEnabled', 'true');

    render(<Staff />);

    const toggle = screen.getByTestId('staff-ptt-hardware-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveStyle({ backgroundColor: 'rgb(239, 68, 68)' });
  });

  it('offers the hardware and LED toggles in web mode too, for testing', () => {
    render(<Staff />);
    expect(screen.getByTestId('app-mode-web')).toHaveClass('selected');
    expect(screen.getByTestId('staff-ptt-hardware-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('staff-led-debug-toggle')).toBeInTheDocument();
  });

  it('shows LED preview toggle when push to talk is enabled in production', async () => {
    vi.stubEnv('DEV', false);
    vi.resetModules();

    const { default: StaffProd } = await import('@main/overlay/Staff');
    render(<StaffProd />);

    expect(screen.getByTestId('staff-led-debug-toggle')).toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it('shows LED preview toggle as active when flag is enabled', () => {
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
    localStorage.setItem('councilPttHardwareEnabled', 'true');
    museumButtonState.bridgeStatus = 'connecting';
    bridgeHealthState.serial = 'disconnected';
    bridgeHealthState.path = null;

    render(<Staff />);

    fireEvent.click(screen.getByText('staff.panels.details'));
    expect(screen.getByTestId('staff-button-usb-hint')).toBeInTheDocument();
  });

  describe('printing', () => {
    const readyPrint: BridgePrintHealth = {
      enabled: true,
      printer: { name: 'Museum_Printer', state: 'idle', alerts: [], message: null },
      pending: 0,
      lastError: null,
      lastPrintedAt: null,
    };

    it('persists the print summaries toggle and shows the printer panel only while on', () => {
      bridgeHealthState.print = readyPrint;
      render(<Staff />);
      expect(screen.queryByTestId('staff-bridge-panel')).not.toBeInTheDocument();

      const toggle = screen.getByTestId('staff-print-summaries-toggle');
      fireEvent.click(toggle);

      expect(localStorage.getItem('councilPrintSummariesEnabled')).toBe('true');
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('staff-print-printer-status')).toHaveTextContent(
        'Museum_Printer — staff.print.printer.idle',
      );
      expect(screen.getByTestId('staff-print-pending')).toHaveTextContent('0');

      fireEvent.click(toggle);
      expect(screen.queryByTestId('staff-bridge-panel')).not.toBeInTheDocument();
    });

    it('shares one bridge panel and one bridge status with the hardware button', () => {
      localStorage.setItem('councilPttHardwareEnabled', 'true');
      localStorage.setItem('councilPrintSummariesEnabled', 'true');
      bridgeHealthState.print = readyPrint;

      render(<Staff />);

      expect(screen.getAllByTestId('staff-bridge-panel')).toHaveLength(1);
      expect(screen.getAllByTestId('staff-bridge-daemon-status')).toHaveLength(1);
      expect(screen.getByTestId('staff-button-usb-status')).toBeInTheDocument();
      expect(screen.getByTestId('staff-print-printer-status')).toBeInTheDocument();
    });

    it('shows only printer chips when printing is on without the hardware button', () => {
      localStorage.setItem('councilPrintSummariesEnabled', 'true');
      bridgeHealthState.print = readyPrint;

      render(<Staff />);

      expect(screen.getByTestId('staff-bridge-daemon-status')).toBeInTheDocument();
      expect(screen.queryByTestId('staff-button-usb-status')).not.toBeInTheDocument();
      expect(screen.getByTestId('staff-print-printer-status')).toBeInTheDocument();
    });

    it.each([
      { name: 'bridge not running', status: 'not_running', print: null, expected: 'staff.print.printer.unavailable' },
      { name: 'bridge predates printing', status: 'running', print: null, expected: 'staff.print.printer.outdated' },
      { name: 'printing off on the bridge', status: 'running', print: { enabled: false }, expected: 'staff.print.printer.disabled' },
      {
        name: 'no default printer',
        status: 'running',
        print: { ...readyPrint, printer: { name: null, state: 'unknown', alerts: [], message: 'No default printer' } },
        expected: 'staff.print.printer.noDefault',
      },
      {
        name: 'printer stopped',
        status: 'running',
        print: { ...readyPrint, printer: { name: 'Museum_Printer', state: 'stopped', alerts: ['media-empty-error'], message: 'Media Empty' } },
        expected: 'Museum_Printer — staff.print.printer.stopped',
      },
    ] as const)('shows the printer as: $name', ({ status, print, expected }) => {
      localStorage.setItem('councilPrintSummariesEnabled', 'true');
      bridgeHealthState.status = status;
      bridgeHealthState.print = print as BridgePrintHealth | null;

      render(<Staff />);

      expect(screen.getByTestId('staff-print-printer-status')).toHaveTextContent(expected);
    });

    it('says what needs attention, counting protocols waiting in the printer too', () => {
      localStorage.setItem('councilPrintSummariesEnabled', 'true');
      bridgeHealthState.print = {
        ...readyPrint,
        printer: { name: 'Museum_Printer', state: 'idle', alerts: ['media-empty-error'], message: null, queuedJobs: 2, oldestJobAt: '2026-09-16T12:00:00.000Z' },
        pending: 1,
        attention: { reason: 'media-empty', since: '2026-09-16T12:00:00.000Z' },
      };

      render(<Staff />);

      expect(screen.getByTestId('staff-print-attention')).toHaveTextContent('out of paper');
      expect(screen.getByTestId('staff-print-pending')).toHaveTextContent('3');
    });

    it('shows no attention chip while the printer is fine', () => {
      localStorage.setItem('councilPrintSummariesEnabled', 'true');
      bridgeHealthState.print = { ...readyPrint, attention: null };

      render(<Staff />);

      expect(screen.queryByTestId('staff-print-attention')).not.toBeInTheDocument();
    });

    it('surfaces why the printer is stuck in the details', () => {
      localStorage.setItem('councilPrintSummariesEnabled', 'true');
      bridgeHealthState.print = {
        ...readyPrint,
        printer: { name: 'Museum_Printer', state: 'stopped', alerts: ['media-empty-error'], message: 'Media Empty' },
        pending: 2,
        lastError: 'lp: printer is offline',
      };

      render(<Staff />);

      expect(screen.getByTestId('staff-print-pending')).toHaveTextContent('2');
      const lines = screen.getAllByTestId('staff-print-detail-line').map((line) => line.textContent);
      expect(lines).toEqual(['Media Empty', 'Printer alerts: media-empty-error', 'Last error: lp: printer is offline']);
    });

    it('prints a test page through the same PDF path and reports the result', async () => {
      localStorage.setItem('councilPrintSummariesEnabled', 'true');
      const blob = new Blob(['%PDF-']);
      mockCreateProtocolPdf.mockResolvedValue({ output: () => blob });
      mockSendTestPage.mockResolvedValue('queued');

      render(<Staff />);
      fireEvent.click(screen.getByTestId('staff-print-test-page'));

      await waitFor(() => {
        expect(screen.getByTestId('staff-print-test-page-result')).toHaveTextContent(
          'staff.print.testPageResult.queued',
        );
      });
      expect(mockCreateProtocolPdf).toHaveBeenCalledWith(screen.getByTestId('staff-test-page-document'));
      expect(mockSendTestPage).toHaveBeenCalledWith(blob);
    });

    it('explains that only museum mode prints', () => {
      localStorage.setItem('councilPrintSummariesEnabled', 'true');
      render(<Staff />);
      expect(screen.getByTestId('staff-print-mode-hint')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('app-mode-museum'));
      expect(screen.queryByTestId('staff-print-mode-hint')).not.toBeInTheDocument();
    });
  });

  describe('printer alert emails', () => {
    const venue = { id: 'example-museum', name: 'Example Museum', recipients: ['s***@example-museum.org'] };
    const alerts = (overrides: Partial<BridgeAlertsHealth> = {}): BridgeAlertsHealth => ({
      configured: true,
      venue: null,
      open: null,
      phase: 'ok',
      lastSentAt: null,
      lastError: null,
      undelivered: false,
      ...overrides,
    });

    beforeEach(() => {
      localStorage.setItem('councilPrintSummariesEnabled', 'true');
      mockFetchAlertVenues.mockResolvedValue({ venues: [venue], current: null });
      mockChooseAlertVenue.mockResolvedValue(undefined);
    });

    it('says alerts are not set up when the bridge has no server, and offers no venue picker', () => {
      bridgeHealthState.alerts = alerts({ configured: false });

      render(<Staff />);

      expect(screen.getByTestId('staff-alerts-status')).toHaveTextContent('staff.alerts.status.notConfigured');
      expect(screen.queryByTestId('staff-alerts-venue')).not.toBeInTheDocument();
      expect(mockFetchAlertVenues).not.toHaveBeenCalled();
    });

    it("lets staff choose a venue from the server's list, and only then send a test", async () => {
      bridgeHealthState.alerts = alerts();

      render(<Staff />);

      expect(screen.getByTestId('staff-alerts-status')).toHaveTextContent('staff.alerts.status.chooseVenue');
      expect(screen.getByTestId('staff-alerts-test')).toBeDisabled();
      const picker = screen.getByTestId('staff-alerts-venue');
      await waitFor(() => expect(picker).not.toBeDisabled());

      fireEvent.change(picker, { target: { value: 'example-museum' } });
      await waitFor(() => expect(mockChooseAlertVenue).toHaveBeenCalledWith('example-museum'));
    });

    it('shows the chosen venue, who is emailed and why alerts are failing', () => {
      bridgeHealthState.print = { enabled: true, printer: null, pending: 0, lastError: null, lastPrintedAt: null };
      bridgeHealthState.alerts = alerts({ venue, lastError: 'council server unreachable' });

      render(<Staff />);

      expect(screen.getByTestId('staff-alerts-status')).toHaveTextContent('staff.alerts.status.failing');
      const lines = screen.getAllByTestId('staff-print-detail-line').map((line) => line.textContent);
      expect(lines).toContain('Alert emails go to s***@example-museum.org');
      expect(lines).toContain('Alert error: council server unreachable');
    });

    it.each([
      { name: 'delivered', outcome: () => mockSendTestAlert.mockResolvedValue(undefined), expected: 'staff.alerts.testResult.sent' },
      {
        name: 'refused',
        outcome: () => mockSendTestAlert.mockRejectedValue(new Error('a test alert was just sent')),
        expected: 'staff.alerts.testResult.failed: a test alert was just sent',
      },
    ])('reports a test alert that was $name', async ({ outcome, expected }) => {
      outcome();
      bridgeHealthState.alerts = alerts({ venue });

      render(<Staff />);
      fireEvent.click(screen.getByTestId('staff-alerts-test'));

      await waitFor(() => expect(screen.getByTestId('staff-alerts-test-result')).toHaveTextContent(expected));
    });
  });
});
