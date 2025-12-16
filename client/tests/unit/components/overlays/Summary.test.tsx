import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Summary from '../../../../src/components/overlays/Summary';
import React from 'react';

// Mock dependencies
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('qrcode.react', () => ({
    QRCodeCanvas: () => <div data-testid="qrcode">QRCode</div>
}));

vi.mock('html-react-parser', () => ({
    default: (html: string) => <div data-testid="parsed-html">{html}</div>
}));

vi.mock('marked', () => ({
    marked: (text: string) => text
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
vi.mock('../../../../src/utils', () => ({
    useMobile: () => false,
    dvh: 'vh' // Mock dvh constant
}));

// Mock dynamic import for Tinos.js
// We need to intercept the dynamic import in PDFToPrint
// Mock dynamic import for Tinos.js
// Intercepting dynamic import in component logic

describe('Summary Overlay', () => {
    const mockSummary = {
        text: '# Meeting Minutes\n\n- Discussed bananas\n- Agreed on apples'
    };
    const mockMeetingId = "12345";

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders summary content correctly', () => {
        render(<Summary summary={mockSummary} meetingId={mockMeetingId} />);

        // Check for header elements (mocked translation keys)
        // We have duplicates because of the PDF print view
        const councilEls = screen.getAllByText('COUNCIL');
        expect(councilEls.length).toBeGreaterThan(0);

        const meetingEls = screen.getAllByText('meeting #12345');
        expect(meetingEls.length).toBeGreaterThan(0);

        // Check for markdown content
        // Since marked is mocked to return identity, and parse renders string as-is
        const minutesEls = screen.getAllByText(/Meeting Minutes/);
        expect(minutesEls.length).toBeGreaterThan(0);

        const bananaEls = screen.getAllByText(/Discussed bananas/);
        expect(bananaEls.length).toBeGreaterThan(0);
    });

    it('triggers PDF download when button is clicked', async () => {
        render(<Summary summary={mockSummary} meetingId={mockMeetingId} />);

        const downloadBtn = screen.getByText('summary.download');
        fireEvent.click(downloadBtn);

        // Wait for dynamic import and execution
        await waitFor(() => {
            // We can check if jsPDF was instantiated or save was called
            // Since jsPDF is mocked to return an object with save
            expect(mockSave).toHaveBeenCalledWith('Council of Foods Meeting Summary #12345.pdf');
        });
    });
});
