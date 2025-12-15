import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConversationControls from '../../../src/components/ConversationControls';

// Mock dependencies
vi.mock('../../../src/components/ConversationControlIcon', () => ({
    default: ({ icon, onClick, tooltip }) => (
        <button data-testid={`control-icon-${icon}`} onClick={onClick} title={tooltip}>
            {icon}
        </button>
    )
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key) => {
            if (key === 'controls.wait') return 'waiting to speak...';
            return key;
        }
    }),
}));

// Mock utils
vi.mock('../../../src/utils', () => ({
    useMobile: () => false,
}));

describe('ConversationControls', () => {
    const defaultProps = {
        isPaused: false,
        onPausePlay: vi.fn(),
        isMuted: false,
        onSkipForward: vi.fn(),
        onSkipBackward: vi.fn(),
        onRaiseHand: vi.fn(),
        onMuteUnmute: vi.fn(),
        isRaisedHand: false,
        isWaitingToInterject: false,
        canGoBack: true,
        canGoForward: true,
        canRaiseHand: true,
        onTopOfOverlay: false,
        humanName: 'Human'
    };

    it('renders all controls when active and not paused', () => {
        const { asFragment } = render(<ConversationControls {...defaultProps} />);

        expect(screen.getByTestId('control-icon-pause')).toBeInTheDocument();
        expect(screen.getByTestId('control-icon-volume_on')).toBeInTheDocument();
        expect(screen.getByTestId('control-icon-backward')).toBeInTheDocument();
        expect(screen.getByTestId('control-icon-forward')).toBeInTheDocument();
        expect(screen.getByTestId('control-icon-raise_hand')).toBeInTheDocument();

        expect(asFragment()).toMatchSnapshot();
    });

    it('renders only play button when paused', () => {
        render(<ConversationControls {...defaultProps} isPaused={true} />);

        expect(screen.getByTestId('control-icon-play')).toBeInTheDocument();

        // Should NOT show other controls when paused (based on implementation: !isPaused && <Icon>)
        expect(screen.queryByTestId('control-icon-volume_on')).not.toBeInTheDocument();
        expect(screen.queryByTestId('control-icon-backward')).not.toBeInTheDocument();
        expect(screen.queryByTestId('control-icon-forward')).not.toBeInTheDocument();

        // Raise hand acts weirdly in code? 
        // Line 68: {!isPaused && canRaiseHand && <Icon>}
        expect(screen.queryByTestId('control-icon-raise_hand')).not.toBeInTheDocument();
    });

    it('shows filled hand when hand is raised', () => {
        render(<ConversationControls {...defaultProps} isRaisedHand={true} />);
        expect(screen.getByTestId('control-icon-raise_hand_filled')).toBeInTheDocument();
    });

    it('shows waiting message when waiting to interject', () => {
        render(<ConversationControls {...defaultProps} isRaisedHand={true} isWaitingToInterject={true} />);
        expect(screen.getByText('Human, waiting to speak...')).toBeInTheDocument();
    });

    it('calls callbacks when buttons are clicked', () => {
        render(<ConversationControls {...defaultProps} />);

        fireEvent.click(screen.getByTestId('control-icon-pause'));
        expect(defaultProps.onPausePlay).toHaveBeenCalled();

        fireEvent.click(screen.getByTestId('control-icon-volume_on'));
        expect(defaultProps.onMuteUnmute).toHaveBeenCalled();

        fireEvent.click(screen.getByTestId('control-icon-backward'));
        expect(defaultProps.onSkipBackward).toHaveBeenCalled();

        fireEvent.click(screen.getByTestId('control-icon-forward'));
        expect(defaultProps.onSkipForward).toHaveBeenCalled();

        fireEvent.click(screen.getByTestId('control-icon-raise_hand'));
        expect(defaultProps.onRaiseHand).toHaveBeenCalled();
    });
});
