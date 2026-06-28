import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CouncilOverlays, { CouncilOverlayType } from '@council/overlays/CouncilOverlays';
import type { ReactNode } from 'react';
import type { Character } from '@shared/ModelTypes';
import '@testing-library/jest-dom';
import { MockFactory } from '../factories/MockFactory';

// Mock Child Components
vi.mock('@council/overlays/Name', () => ({
    default: ({ participants: _participants, onContinueForward }: { participants?: Character[]; onContinueForward: (data: { humanName: string }) => void }) => (
        <div data-testid="name-overlay">
            Name Overlay
            <button onClick={() => onContinueForward({ humanName: 'Leo' })}>Submit Name</button>
        </div>
    )
}));
vi.mock('@council/overlays/QueryExtension', () => ({
    default: ({ onContinue, onWrapItUp }: { onContinue: () => void; onWrapItUp: () => void }) => (
        <div data-testid="query-extension-overlay">
            Query Extension Overlay
            <button onClick={() => onContinue()}>Continue</button>
            <button onClick={() => onWrapItUp()}>Wrap Up</button>
        </div>
    )
}));
vi.mock('@council/overlays/Summary', () => ({
    default: ({ summary: _summary, meetingId: _meetingId }: { summary?: unknown; meetingId?: number }) => <div data-testid="summary-overlay">Summary Overlay</div>
}));

// Mock OverlayWrapper
vi.mock('@main/overlay/OverlayWrapper', () => ({
    default: ({ children }: { children?: ReactNode }) => <div data-testid="overlay-wrapper">{children}</div>
}));

describe('CouncilOverlays', () => {
    const mockOnContinue = vi.fn();
    const mockOnAttemptResume = vi.fn();
    const mockOnWrapItUp = vi.fn();
    const mockProceedWithHumanName = vi.fn();
    const mockcancelOverlay = vi.fn();
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
        activeOverlay: null as CouncilOverlayType,
        onContinue: mockOnContinue,
        onAttemptResume: mockOnAttemptResume,
        onWrapItUp: mockOnWrapItUp,
        proceedWithHumanName: mockProceedWithHumanName,
        cancelOverlay: mockcancelOverlay,
        summary: mockSummary,
        meetingId: 123,
        participants: mockParticipants
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders nothing when activeOverlay is null', () => {
        render(<CouncilOverlays {...defaultProps} activeOverlay={null} />);
        expect(screen.queryByTestId('overlay-wrapper')).toBeInTheDocument(); // Wrapper always renders if parent calls it, but content is null?
        // Wait, current logic: OverlayWrapper wraps the content.
        // If content is null, OverlayWrapper still renders children=null.
        // Let's check implementation: 
        // return <OverlayWrapper>{renderOverlayContent()}</OverlayWrapper>
        // So yes, wrapper is rendered.
        expect(screen.queryByTestId('name-overlay')).not.toBeInTheDocument();
        expect(screen.queryByTestId('query-extension-overlay')).not.toBeInTheDocument();
        expect(screen.queryByTestId('summary-overlay')).not.toBeInTheDocument();
    });

    it('renders Name overlay when activeOverlay is "name"', () => {
        render(<CouncilOverlays {...defaultProps} activeOverlay="name" />);
        expect(screen.getByTestId('name-overlay')).toBeInTheDocument();
    });

    it('renders QueryExtension overlay when activeOverlay is "query_extension"', () => {
        render(<CouncilOverlays {...defaultProps} activeOverlay="query_extension" />);
        expect(screen.getByTestId('query-extension-overlay')).toBeInTheDocument();
    });

    it('renders Summary overlay when activeOverlay is "summary"', () => {
        render(<CouncilOverlays {...defaultProps} activeOverlay="summary" />);
        expect(screen.getByTestId('summary-overlay')).toBeInTheDocument();
    });

    it('passes callbacks correctly to Name overlay', () => {
        render(<CouncilOverlays {...defaultProps} activeOverlay="name" />);
        screen.getByText('Submit Name').click();
        expect(mockProceedWithHumanName).toHaveBeenCalledWith({ humanName: 'Leo' });
    });

    it('passes callbacks correctly to QueryExtension overlay', () => {
        render(<CouncilOverlays {...defaultProps} activeOverlay="query_extension" />);
        screen.getByText('Continue').click();
        expect(mockOnContinue).toHaveBeenCalled();

        screen.getByText('Wrap Up').click();
        expect(mockOnWrapItUp).toHaveBeenCalled();
    });
});
