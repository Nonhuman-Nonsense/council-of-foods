import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConversationControlIcon from '../../../src/components/ConversationControlIcon';

// Mock utils
vi.mock('../../../src/utils', () => ({
    useMobile: () => false,
}));

describe('ConversationControlIcon', () => {
    const defaultProps = {
        icon: 'test_icon',
        tooltip: 'Test Action',
        onClick: vi.fn(),
    };

    it('renders normal icon by default', () => {
        const { asFragment } = render(<ConversationControlIcon {...defaultProps} />);

        // We expect icon-test_icon and icon-test_icon_filled (hover, hidden)
        const icon = screen.getByTestId('icon-test_icon');
        const hoverIcon = screen.getByTestId('icon-test_icon_filled');

        expect(icon).toBeInTheDocument();
        expect(hoverIcon).toBeInTheDocument();

        expect(icon).toHaveStyle({ opacity: '1' });

        expect(asFragment()).toMatchSnapshot();
    });

    it('shows hover icon when mice enters', () => {
        render(<ConversationControlIcon {...defaultProps} />);

        const button = screen.getByRole('button');
        fireEvent.mouseOver(button);

        const icon = screen.getByTestId('icon-test_icon');
        const hoverIcon = screen.getByTestId('icon-test_icon_filled');

        // Normal icon hidden
        expect(icon).toHaveStyle({ opacity: '0' });
        // Hover icon visible
        expect(hoverIcon).toHaveStyle({ opacity: '1' });
    });

    it('uses custom hoverIcon if provided', () => {
        render(<ConversationControlIcon {...defaultProps} hoverIcon="custom_hover" />);
        const hoverIcon = screen.getByTestId('icon-custom_hover');
        expect(hoverIcon).toBeInTheDocument();
    });

    it('calls onClick when clicked', () => {
        render(<ConversationControlIcon {...defaultProps} />);
        fireEvent.click(screen.getByRole('button'));
        expect(defaultProps.onClick).toHaveBeenCalled();
    });
});
