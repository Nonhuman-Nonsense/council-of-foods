import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CouncilOverlays, { CouncilOverlayType } from '@components/CouncilOverlays';
import React from 'react';
import { Character } from '@shared/ModelTypes';
import '@testing-library/jest-dom';

// Mock Child Components
vi.mock('@components/overlays/Name', () => ({
    default: ({ participants, onContinueForward }: any) => (
        <div data-testid="name-overlay">
            Name Overlay
            <button onClick={() => onContinueForward({ humanName: 'Leo' })}>Submit Name</button>
        </div>
    )
}));
vi.mock('@components/overlays/Completed', () => ({
    default: ({ onContinue, onWrapItUp, canExtendMeeting }: any) => (
        <div data-testid="completed-overlay">
            Completed Overlay
            <button onClick={() => onContinue()}>Continue</button>
            <button onClick={() => onWrapItUp()}>Wrap Up</button>
        </div>
    )
}));
vi.mock('@components/overlays/Summary', () => ({
    default: ({ summary, meetingId }: any) => <div data-testid="summary-overlay">Summary Overlay</div>
}));

// Mock OverlayWrapper
vi.mock('@components/OverlayWrapper', () => ({
    default: ({ children }: any) => <div data-testid="overlay-wrapper">{children}</div>
}));

describe('CouncilOverlays', () => {
    const mockOnContinue = vi.fn();
    const mockOnWrapItUp = vi.fn();
    const mockProceedWithHumanName = vi.fn();
    const mockRemoveOverlay = vi.fn();
    const mockSummary = { text: 'Test Summary Content' };
    const mockParticipants: Character[] = [{
        id: 'water',
        name: 'Water',
        voice: 'alloy',


        prompt: 'You are Water...'
    }];

    const defaultProps = {
        activeOverlay: null as CouncilOverlayType,
        onContinue: mockOnContinue,
        onWrapItUp: mockOnWrapItUp,
        proceedWithHumanName: mockProceedWithHumanName,
        canExtendMeeting: true,
        removeOverlay: mockRemoveOverlay,
        summary: mockSummary,
        meetingId: 'meeting-123',
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
        expect(screen.queryByTestId('completed-overlay')).not.toBeInTheDocument();
        expect(screen.queryByTestId('summary-overlay')).not.toBeInTheDocument();
    });

    it('renders Name overlay when activeOverlay is "name"', () => {
        render(<CouncilOverlays {...defaultProps} activeOverlay="name" />);
        expect(screen.getByTestId('name-overlay')).toBeInTheDocument();
    });

    it('renders Completed overlay when activeOverlay is "completed"', () => {
        render(<CouncilOverlays {...defaultProps} activeOverlay="completed" />);
        expect(screen.getByTestId('completed-overlay')).toBeInTheDocument();
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

    it('passes callbacks correctly to Completed overlay', () => {
        render(<CouncilOverlays {...defaultProps} activeOverlay="completed" />);
        screen.getByText('Continue').click();
        expect(mockOnContinue).toHaveBeenCalled();

        screen.getByText('Wrap Up').click();
        expect(mockOnWrapItUp).toHaveBeenCalled();
    });
});
