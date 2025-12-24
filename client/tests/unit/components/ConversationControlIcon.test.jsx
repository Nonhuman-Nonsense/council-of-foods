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

        const imgs = screen.getAllByRole('img');
        expect(imgs).toHaveLength(2); // Normal + Hover (hidden)

        // Check src of first image
        expect(imgs[0]).toHaveAttribute('src', '/icons/test_icon.svg');
        expect(imgs[0]).toHaveStyle({ opacity: '1' });

        expect(asFragment()).toMatchSnapshot();
    });

    it('shows hover icon when mice enters', () => {
        render(<ConversationControlIcon {...defaultProps} />);

        const button = screen.getByRole('button');
        fireEvent.mouseOver(button);

        const imgs = screen.getAllByRole('img');
        // Normal icon hidden
        expect(imgs[0]).toHaveStyle({ opacity: '0' });
        // Hover icon visible
        expect(imgs[1]).toHaveAttribute('src', '/icons/test_icon_filled.svg');
        expect(imgs[1]).toHaveStyle({ opacity: '1' });
    });

    it('uses custom hoverIcon if provided', () => {
        render(<ConversationControlIcon {...defaultProps} hoverIcon="custom_hover" />);
        const imgs = screen.getAllByRole('img');
        expect(imgs[1]).toHaveAttribute('src', '/icons/custom_hover.svg');
    });

    it('calls onClick when clicked', () => {
        render(<ConversationControlIcon {...defaultProps} />);
        fireEvent.click(screen.getByRole('button'));
        expect(defaultProps.onClick).toHaveBeenCalled();
    });
});
