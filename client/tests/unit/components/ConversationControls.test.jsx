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

    beforeEach(() => {
        vi.clearAllMocks();
    });

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

    it('shows waiting message when waiting to interject and not paused', () => {
        render(<ConversationControls {...defaultProps} isRaisedHand={true} isWaitingToInterject={true} isPaused={false} />);
        expect(screen.getByText('Human, waiting to speak...')).toBeInTheDocument();
    });

    it('hides waiting message when paused even if waiting to interject', () => {
        render(<ConversationControls {...defaultProps} isRaisedHand={true} isWaitingToInterject={true} isPaused={true} />);
        expect(screen.queryByText('Human, waiting to speak...')).not.toBeInTheDocument();
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

    it('sets high z-index when onTopOfOverlay is true', () => {
        const { container } = render(<ConversationControls {...defaultProps} onTopOfOverlay={true} />);
        // The outer div has the style. currently it's the first child.
        const outerDiv = container.firstChild;
        expect(outerDiv).toHaveStyle({ zIndex: '10' });
    });

    it('sets default z-index when onTopOfOverlay is false', () => {
        const { container } = render(<ConversationControls {...defaultProps} onTopOfOverlay={false} />);
        const outerDiv = container.firstChild;
        expect(outerDiv).toHaveStyle({ zIndex: '3' });
    });

    it('hides specific controls when capability flags are false', () => {
        render(<ConversationControls
            {...defaultProps}
            canGoBack={false}
            canGoForward={false}
            canRaiseHand={false}
        />);

        expect(screen.queryByTestId('control-icon-backward')).not.toBeInTheDocument();
        expect(screen.queryByTestId('control-icon-forward')).not.toBeInTheDocument();

        // Raise hand should be hidden if canRaiseHand is false AND isRaisedHand is false
        expect(screen.queryByTestId('control-icon-raise_hand')).not.toBeInTheDocument();

        // Volume and Pause/Play should still be there
        expect(screen.getByTestId('control-icon-volume_on')).toBeInTheDocument();
        expect(screen.getByTestId('control-icon-pause')).toBeInTheDocument();
    });

    it('shows raise hand controls if hand is already raised, even if canRaiseHand is false', () => {
        render(<ConversationControls
            {...defaultProps}
            canRaiseHand={false}
            isRaisedHand={true}
        />);

        expect(screen.getByTestId('control-icon-raise_hand_filled')).toBeInTheDocument();
    });

    it('disables pointer events on raise hand button when hand is already raised', () => {
        const { container } = render(<ConversationControls {...defaultProps} isRaisedHand={true} />);

        // The container of the raise hand icon has the pointer-events style
        // We need to find the specific container div. 
        // Based on implementation, it's the 5th child of the flex container.
        // Structure: div(root) -> div(flex) -> div(child 1..5)

        // Let's use a more robust selector if possible, or traverse
        // Implementation: <div style={{ ...divStyle, pointerEvents: isRaisedHand ? "none" : "auto" }}>

        // We can find the button and go up to its parent
        const raiseHandBtn = screen.getByTestId('control-icon-raise_hand_filled');
        const parentDiv = raiseHandBtn.parentElement;

        expect(parentDiv).toHaveStyle({ pointerEvents: 'none' });
    });

    it('does not trigger onRaiseHand if already raised (redundant check via pointer-events, but logic check)', () => {
        render(<ConversationControls {...defaultProps} isRaisedHand={true} />);
        const raiseHandBtn = screen.getByTestId('control-icon-raise_hand_filled');

        fireEvent.click(raiseHandBtn);
        expect(defaultProps.onRaiseHand).not.toHaveBeenCalled();
    });
});
