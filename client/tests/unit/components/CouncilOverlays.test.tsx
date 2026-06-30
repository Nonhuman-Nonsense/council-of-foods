import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CouncilOverlays from '@council/overlays/CouncilOverlays';
import type { ActiveCouncilOverlay } from '@council/overlays/CouncilOverlays';
import type { ReactNode } from 'react';
import type { Character } from '@shared/ModelTypes';
import '@testing-library/jest-dom';
import { MockFactory } from '../factories/MockFactory';

vi.mock('@council/overlays/Name', () => ({
    default: ({ participants: _participants, onContinueForward }: { participants?: Character[]; onContinueForward: (data: { humanName: string }) => void }) => (
        <div data-testid="name-overlay">
            Name Overlay
            <button onClick={() => onContinueForward({ humanName: 'Leo' })}>Submit Name</button>
        </div>
    )
}));
vi.mock('@council/overlays/QueryExtension', () => ({
    default: ({ onExtendMeeting, onConcludeMeeting }: { onExtendMeeting: () => void; onConcludeMeeting: () => void }) => (
        <div data-testid="query-extension-overlay">
            Query Extension Overlay
            <button onClick={() => onExtendMeeting()}>Extend</button>
            <button onClick={() => onConcludeMeeting()}>Conclude</button>
        </div>
    )
}));
vi.mock('@council/overlays/Incomplete', () => ({
    default: ({ onAttemptResume, onNevermind }: { onAttemptResume: () => void; onNevermind: () => void }) => (
        <div data-testid="meeting-incomplete-overlay">
            Incomplete Overlay
            <button onClick={() => onAttemptResume()}>Resume</button>
            <button onClick={() => onNevermind()}>Nevermind</button>
        </div>
    )
}));
vi.mock('@council/overlays/Summary', () => ({
    default: ({ summary: _summary, meetingId: _meetingId }: { summary?: unknown; meetingId?: number }) => <div data-testid="summary-overlay">Summary Overlay</div>
}));

vi.mock('@main/overlay/OverlayWrapper', () => ({
    default: ({ children, showX }: { children?: ReactNode; showX?: boolean }) => (
        <div data-testid="overlay-wrapper" data-show-x={String(showX)}>{children}</div>
    ),
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

describe('CouncilOverlays', () => {
    const mockOnExtendMeeting = vi.fn();
    const mockOnAttemptResume = vi.fn();
    const mockOnConcludeMeeting = vi.fn();
    const mockProceedWithHumanName = vi.fn();
    const mockOnDismiss = vi.fn();
    const mockSummary = { text: 'Test Summary Content' };
    const mockParticipants: Character[] = [
        MockFactory.createCharacter({
            id: 'water',
            name: 'Water',
            description: '',
            prompt: 'You are Water...',
        }),
    ];

    const defaultProps = {
        overlay: 'name' as ActiveCouncilOverlay,
        onAttemptResume: mockOnAttemptResume,
        onExtendMeeting: mockOnExtendMeeting,
        onConcludeMeeting: mockOnConcludeMeeting,
        proceedWithHumanName: mockProceedWithHumanName,
        onDismiss: mockOnDismiss,
        summary: mockSummary,
        meetingId: 123,
        participants: mockParticipants
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockUseCouncilSettings.mockReturnValue({
            isMuseumMode: false,
            mode: 'web',
            setAppMode: vi.fn(),
            agentMode: 'off',
            setAgentMode: vi.fn(),
        });
    });

    it('renders Name overlay when overlay is "name"', () => {
        render(<CouncilOverlays {...defaultProps} overlay="name" />);
        expect(screen.getByTestId('name-overlay')).toBeInTheDocument();
    });

    it('renders QueryExtension overlay when overlay is "query_extension"', () => {
        render(<CouncilOverlays {...defaultProps} overlay="query_extension" />);
        expect(screen.getByTestId('query-extension-overlay')).toBeInTheDocument();
    });

    it('renders meeting_incomplete overlay when overlay matches councilState name', () => {
        render(<CouncilOverlays {...defaultProps} overlay="meeting_incomplete" />);
        expect(screen.getByTestId('meeting-incomplete-overlay')).toBeInTheDocument();
    });

    it('renders Summary overlay when overlay is "summary"', () => {
        render(<CouncilOverlays {...defaultProps} overlay="summary" />);
        expect(screen.getByTestId('summary-overlay')).toBeInTheDocument();
    });

    it('hides the overlay close button for museum summary', () => {
        mockUseCouncilSettings.mockReturnValue({
            isMuseumMode: true,
            mode: 'museum',
            setAppMode: vi.fn(),
            agentMode: 'ptt',
            setAgentMode: vi.fn(),
        });

        render(<CouncilOverlays {...defaultProps} overlay="summary" />);
        expect(screen.getByTestId('overlay-wrapper')).toHaveAttribute('data-show-x', 'false');
    });

    it('shows the overlay close button for web summary', () => {
        render(<CouncilOverlays {...defaultProps} overlay="summary" />);
        expect(screen.getByTestId('overlay-wrapper')).toHaveAttribute('data-show-x', 'true');
    });

    it('passes callbacks correctly to Name overlay', () => {
        render(<CouncilOverlays {...defaultProps} overlay="name" />);
        screen.getByText('Submit Name').click();
        expect(mockProceedWithHumanName).toHaveBeenCalledWith({ humanName: 'Leo' });
    });

    it('passes callbacks correctly to QueryExtension overlay', () => {
        render(<CouncilOverlays {...defaultProps} overlay="query_extension" />);
        screen.getByText('Extend').click();
        expect(mockOnExtendMeeting).toHaveBeenCalled();

        screen.getByText('Conclude').click();
        expect(mockOnConcludeMeeting).toHaveBeenCalled();
    });
});
