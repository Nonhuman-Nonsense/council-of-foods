import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Summary from '@council/overlays/Summary';

vi.mock('qrcode.react', () => ({
    QRCodeCanvas: () => <div data-testid="qrcode">QRCode</div>
}));

vi.mock('html-react-parser', () => ({
    default: (html: string) => <div data-testid="parsed-html">{html}</div>
}));

vi.mock('marked', () => ({
    marked: {
        parse: (text: string) => text
    }
}));

// Mock jsPDF
const mockSave = vi.fn();
const mockHtml = vi.fn((element, options) => {
    // Execute callback immediately to simulate completion
    if (options && options.callback) {
        options.callback({});
    }
});
const mockSetFont = vi.fn();

vi.mock('jspdf', () => {
    const MockJsPDF = vi.fn(function () {
        return {
            setFont: mockSetFont,
            html: mockHtml,
            save: mockSave,
        };
    });
    // @ts-ignore
    MockJsPDF.API = {
        events: []
    };
    return {
        jsPDF: MockJsPDF
    };
});

// Mock utils
const mockUseMobile = vi.fn();
vi.mock('@/utils', () => ({
    useMobile: () => mockUseMobile(),
    dvh: 'vh' // Mock dvh constant
}));

const mockUseCouncilSettings = vi.fn(() => ({
    isMuseumMode: false,
    mode: 'web' as const,
    setAppMode: vi.fn(),
    agentMode: 'off' as const,
    setAgentMode: vi.fn(),
}));

vi.mock('@/settings/councilSettings', () => ({
    useCouncilSettings: () => mockUseCouncilSettings(),
}));

const mockClaim = vi.fn();
const mockRelease = vi.fn();
const mockSetLed = vi.fn();
let mockPressed = false;

vi.mock('@museum/button/useButton', () => ({
    useButton: () => ({
        claim: mockClaim,
        release: mockRelease,
        setLed: mockSetLed,
        get pressed() {
            return mockPressed;
        },
        isOwner: true,
    }),
}));

const mockUseButtonBanner = vi.fn();
vi.mock('@museum/button/useButtonBanner', () => ({
    useButtonBanner: (...args: unknown[]) => mockUseButtonBanner(...args),
}));

const mockNavigate = vi.fn();
vi.mock('react-router', () => ({
    useNavigate: () => mockNavigate,
}));

vi.mock('@/navigation', () => ({
    useRouting: () => ({ rootPath: '/en/' }),
}));

const mockAutoplayState = {
    phase: 'off' as 'off' | 'warning' | 'active',
    summaryProtocolFinished: false,
};

vi.mock('@/autoplay/autoplayStore', () => ({
    useAutoplayStore: (selector: (state: typeof mockAutoplayState) => unknown) =>
        selector(mockAutoplayState),
    SUMMARY_RETURN_TO_ROOT_MS: 20_000,
}));

class ResizeObserverMock {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
    }

    observe(target: Element): void {
        this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }

    disconnect(): void {
        // no-op
    }
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

// Mock dynamic import for Tinos.js
// Intercepting dynamic import in component logic

describe('Summary Overlay', () => {
    const mockSummary = {
        text: '# Meeting Minutes\n\n- Discussed bananas\n- Agreed on apples'
    };
    const mockMeetingId = "12345";

    beforeEach(() => {
        vi.clearAllMocks();
        mockPressed = false;
        mockUseMobile.mockReturnValue(false); // Default to desktop
        mockAutoplayState.phase = 'off';
        mockAutoplayState.summaryProtocolFinished = false;
        mockUseCouncilSettings.mockReturnValue({
            isMuseumMode: false,
            mode: 'web',
            setAppMode: vi.fn(),
            agentMode: 'off',
            setAgentMode: vi.fn(),
        });
    });

    it('renders summary content correctly', () => {
        render(<Summary summary={mockSummary} meetingId={mockMeetingId} />);

        // Check for header elements (mocked translation keys)
        // We have duplicates because of the PDF print view
        const councilEls = screen.getAllByText('COUNCIL OF FOODS');
        expect(councilEls.length).toBeGreaterThan(0);

        const meetingEls = screen.getAllByText(/Meeting #12345/);
        expect(meetingEls.length).toBeGreaterThan(0);

        // Check for markdown content
        // Since marked is mocked to return identity, and parse renders string as-is
        const minutesEls = screen.getAllByText(/Meeting Minutes/);
        expect(minutesEls.length).toBeGreaterThan(0);

        const bananaEls = screen.getAllByText(/Discussed bananas/);
        expect(bananaEls.length).toBeGreaterThan(0);

        // Disclaimer copy and its attribution/funding links.
        expect(
            screen.getAllByText(/This document was created by the Council of Foods/).length,
        ).toBeGreaterThan(0);
        expect(
            screen.getAllByRole('link', { name: 'Nonhuman Nonsense' }).length,
        ).toBeGreaterThan(0);
        expect(
            screen.getAllByRole('link', { name: 'grant agreement 101069990' }).length,
        ).toBeGreaterThan(0);

        // The hidden PDF template (#printed-style) is present in web mode.
        expect(document.querySelector('#printed-style')).toBeInTheDocument();
    });

    it('renders correctly in mobile mode', () => {
        mockUseMobile.mockReturnValue(true);
        render(<Summary summary={mockSummary} meetingId={mockMeetingId} />);

        // We verified visual styles by checking if the structure renders without error
        // and specific mobile-only classes or styles are applied if checked (though styles are inline here)
        // Asserting basic presence is sufficient to catch crashes
        expect(screen.getAllByText('COUNCIL OF FOODS').length).toBeGreaterThan(0);
    });

    it('displays the QR code with correct link', () => {
        render(<Summary summary={mockSummary} meetingId={mockMeetingId} />);

        // Our mock renders <div data-testid="qrcode">QRCode</div>
        const qrCodes = screen.getAllByTestId('qrcode');
        expect(qrCodes.length).toBeGreaterThan(0);

        // In a real functionality test we might check the value prop passed to QRCodeCanvas
        // but since we mocked it, we just check presence.
        // To verify props we would need to inspect the mock call arguments if we mocked it as a spy.
    });

    it('triggers PDF download when button is clicked', async () => {
        render(<Summary summary={mockSummary} meetingId={mockMeetingId} />);

        const downloadBtn = screen.getByTestId('summary-download');
        fireEvent.click(downloadBtn);

        // Wait for dynamic import and execution
        await waitFor(() => {
            // We can check if jsPDF was instantiated or save was called
            // Since jsPDF is mocked to return an object with save
            expect(mockSave).toHaveBeenCalledWith('Council of Foods Meeting Summary #12345.pdf');
        });
    });

    it('hides PDF download and template in museum mode', () => {
        mockUseCouncilSettings.mockReturnValue({
            isMuseumMode: true,
            mode: 'museum',
            setAppMode: vi.fn(),
            agentMode: 'ptt',
            setAgentMode: vi.fn(),
        });

        Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
            configurable: true,
            get() {
                return 400;
            },
        });

        render(<Summary summary={mockSummary} meetingId={mockMeetingId} />);

        expect(screen.queryByTestId('summary-download')).not.toBeInTheDocument();
        expect(document.querySelector('#printed-style')).not.toBeInTheDocument();
        expect(screen.getByTestId('summary-protocol')).toBeInTheDocument();
        expect(screen.getByTestId('summary-protocol')).toHaveClass('scroll--hide-scrollbar');

        const wrapper = screen.getByTestId('summary-wrapper');
        expect(wrapper).toHaveStyle({
            position: 'fixed',
            top: '0px',
            height: '100vh',
        });

        const teleprompter = screen.getByTestId('summary-teleprompter-content');
        expect(teleprompter).toHaveStyle({ paddingBottom: '140px', paddingTop: '80px' });
    });

    it('claims the button and shows the summary banner in museum PTT mode', () => {
        mockUseCouncilSettings.mockReturnValue({
            isMuseumMode: true,
            mode: 'museum',
            setAppMode: vi.fn(),
            agentMode: 'ptt',
            setAgentMode: vi.fn(),
        });

        render(<Summary summary={mockSummary} meetingId={mockMeetingId} />);

        expect(mockClaim).toHaveBeenCalled();
        expect(mockSetLed).toHaveBeenCalledWith('pulse');
        expect(mockUseButtonBanner).toHaveBeenCalledWith(
            expect.objectContaining({
                owner: 'summary',
                sessionActive: true,
                bannerImmediate: true,
                messageKey: 'summary.banner.pressToRestart',
            }),
        );
    });

    it('navigates to landing on button press in museum PTT mode', () => {
        mockUseCouncilSettings.mockReturnValue({
            isMuseumMode: true,
            mode: 'museum',
            setAppMode: vi.fn(),
            agentMode: 'ptt',
            setAgentMode: vi.fn(),
        });

        const { rerender } = render(<Summary summary={mockSummary} meetingId={mockMeetingId} />);

        mockPressed = true;
        rerender(<Summary summary={mockSummary} meetingId={mockMeetingId} />);

        expect(mockNavigate).toHaveBeenCalledWith('/en/');
    });

    it('returns to landing 20s after protocol reading when not in autoplay', () => {
        vi.useFakeTimers();
        mockUseCouncilSettings.mockReturnValue({
            isMuseumMode: true,
            mode: 'museum',
            setAppMode: vi.fn(),
            agentMode: 'ptt',
            setAgentMode: vi.fn(),
        });
        mockAutoplayState.phase = 'off';
        mockAutoplayState.summaryProtocolFinished = true;

        render(<Summary summary={mockSummary} meetingId={mockMeetingId} />);

        expect(mockNavigate).not.toHaveBeenCalled();
        vi.advanceTimersByTime(20_000);
        expect(mockNavigate).toHaveBeenCalledWith('/en/');
        vi.useRealTimers();
    });

    it('does not auto-return to landing during an active autoplay loop', () => {
        vi.useFakeTimers();
        mockUseCouncilSettings.mockReturnValue({
            isMuseumMode: true,
            mode: 'museum',
            setAppMode: vi.fn(),
            agentMode: 'ptt',
            setAgentMode: vi.fn(),
        });
        mockAutoplayState.phase = 'active';
        mockAutoplayState.summaryProtocolFinished = true;

        render(<Summary summary={mockSummary} meetingId={mockMeetingId} />);

        vi.advanceTimersByTime(20_000);
        expect(mockNavigate).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('does not claim the button in web mode', () => {
        render(<Summary summary={mockSummary} meetingId={mockMeetingId} />);

        expect(mockClaim).not.toHaveBeenCalled();
        expect(mockUseButtonBanner).toHaveBeenCalledWith(
            expect.objectContaining({ sessionActive: false }),
        );
    });
});
