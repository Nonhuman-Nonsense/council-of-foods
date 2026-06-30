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

// Mock dynamic import for Tinos.js
// Intercepting dynamic import in component logic

describe('Summary Overlay', () => {
    const mockSummary = {
        text: '# Meeting Minutes\n\n- Discussed bananas\n- Agreed on apples'
    };
    const mockMeetingId = "12345";

    beforeEach(() => {
        vi.clearAllMocks();
        mockUseMobile.mockReturnValue(false); // Default to desktop
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

    it('includes the disclaimer', () => {
        render(<Summary summary={mockSummary} meetingId={mockMeetingId} />);

        expect(
            screen.getAllByText(/This document was created by the Council of Foods/).length,
        ).toBeGreaterThan(0);
        expect(
            screen.getAllByRole('link', { name: 'Nonhuman Nonsense' }).length,
        ).toBeGreaterThan(0);
        expect(
            screen.getAllByRole('link', { name: 'grant agreement 101069990' }).length,
        ).toBeGreaterThan(0);
    });

    it('renders the hidden PDF template', () => {
        render(<Summary summary={mockSummary} meetingId={mockMeetingId} />);

        // The PDF template has id="printed-style" inside it, or we can look for the hidden wrapper
        // The hidden wrapper has style display: none, so it might not be visible in default query
        // using { hidden: true } usually works for getByText if we needed

        // We can find the specific element structure for the PDF
        // referenced by protocolRef

        // Looking for the duplicate content is a good proxy, which we did in the first test.
        // Let's specifically look for the PDF footer or header structure if unique
        // "printed-style" is a unique ID used in the PDF template
        const printedStyleDiv = document.querySelector('#printed-style');
        expect(printedStyleDiv).toBeInTheDocument();
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

        render(<Summary summary={mockSummary} meetingId={mockMeetingId} />);

        expect(screen.queryByTestId('summary-download')).not.toBeInTheDocument();
        expect(document.querySelector('#printed-style')).not.toBeInTheDocument();
        expect(screen.getByTestId('summary-protocol')).toBeInTheDocument();
    });
});
