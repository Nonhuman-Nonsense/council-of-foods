import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConversationControlIcon from '@council/ConversationControlIcon';

// Mock utils
vi.mock('@/utils', () => ({
    useMobile: () => false,
}));

describe('ConversationControlIcon', () => {
    const defaultProps = {
        icon: 'play' as const,
        tooltip: 'Test Action',
        onClick: vi.fn(),
    };

    it('renders normal icon by default', () => {
        render(<ConversationControlIcon {...defaultProps} />);

        // We expect icon-play and icon-play_filled (hover, hidden)
        const icon = screen.getByTestId('icon-play');
        const hoverIcon = screen.getByTestId('icon-play_filled');

        expect(icon).toBeInTheDocument();
        expect(hoverIcon).toBeInTheDocument();

        expect(icon).toHaveStyle({ opacity: '1' });
    });

    it('shows hover icon when mice enters', () => {
        render(<ConversationControlIcon {...defaultProps} />);

        const button = screen.getByRole('button');
        fireEvent.mouseOver(button);

        const icon = screen.getByTestId('icon-play');
        const hoverIcon = screen.getByTestId('icon-play_filled');

        // Normal icon hidden
        expect(icon).toHaveStyle({ opacity: '0' });
        // Hover icon visible
        expect(hoverIcon).toHaveStyle({ opacity: '1' });
    });

    it('uses custom hoverIcon if provided', () => {
        render(<ConversationControlIcon {...defaultProps} hoverIcon="close" />);
        const hoverIcon = screen.getByTestId('icon-close');
        expect(hoverIcon).toBeInTheDocument();
    });

    it('calls onClick when clicked', () => {
        render(<ConversationControlIcon {...defaultProps} />);
        fireEvent.click(screen.getByRole('button'));
        expect(defaultProps.onClick).toHaveBeenCalled();
    });
});
