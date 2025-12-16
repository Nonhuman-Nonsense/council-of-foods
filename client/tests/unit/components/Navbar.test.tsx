import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Navbar from '@components/Navbar';
import React from 'react';
import { MemoryRouter } from 'react-router';
import '@testing-library/jest-dom';

// Mock Dependencies
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-lottie-player', async () => {
    const React = await import('react');
    const { vi } = await import('vitest');
    return {
        default: React.forwardRef((props: any, ref: any) => {
            React.useImperativeHandle(ref, () => ({
                play: vi.fn(),
                setDirection: vi.fn(),
                stop: vi.fn(),
            }));
            return <div data-testid="lottie-player" {...props} />;
        })
    };
});

// Mock Utils (Responsive Hooks)
vi.mock('@/utils', () => ({
    useMobile: vi.fn(),
    useMobileXs: vi.fn(),
    usePortrait: vi.fn(),
    capitalizeFirstLetter: (str: string) => str.charAt(0).toUpperCase() + str.slice(1),
}));

// Mock react-responsive
vi.mock('react-responsive', () => ({
    useMediaQuery: vi.fn()
}));

// Mock Assets
vi.mock('@/animations/hamburger.json', () => ({ default: {} }));

import * as utils from '@/utils';
import * as responsive from 'react-responsive';

describe('Navbar', () => {
    const mockSetHamburgerOpen = vi.fn();
    const defaultProps = {
        lang: 'en',
        topic: 'test topic',
        hamburgerOpen: false,
        setHamburgerOpen: mockSetHamburgerOpen
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // Default: Desktop
        vi.mocked(utils.useMobile).mockReturnValue(false);
        vi.mocked(utils.useMobileXs).mockReturnValue(false);
        vi.mocked(utils.usePortrait).mockReturnValue(false);
        vi.mocked(responsive.useMediaQuery).mockReturnValue(true); // showIconinMeny
    });

    const renderNavbar = (props = defaultProps) => {
        return render(
            <MemoryRouter initialEntries={['/meeting/123']}>
                <Navbar {...props} />
            </MemoryRouter>
        );
    };

    it('renders desktop navbar correctly', () => {
        renderNavbar();
        expect(screen.getByText('COUNCIL')).toBeVisible();
        expect(screen.getByText('Test topic')).toBeVisible();
        expect(screen.getByText('SETTINGS')).toBeVisible();
        expect(screen.getByText('ABOUT')).toBeVisible();
        expect(screen.getByText('CONTACT')).toBeVisible();
        expect(screen.queryByTestId('lottie-player')).not.toBeInTheDocument();
    });

    it('renders mobile navbar with hamburger', () => {
        vi.mocked(utils.useMobile).mockReturnValue(true);
        renderNavbar();

        // Hamburger should be visible
        expect(screen.getByTestId('lottie-player')).toBeInTheDocument();

        // Items hidden by default on mobile
        const settings = screen.getByText('SETTINGS');
        const style = window.getComputedStyle(settings.closest('span')!);
        expect(style.opacity).toBe('0');
    });

    it('toggles hamburger menu on click', () => {
        vi.mocked(utils.useMobile).mockReturnValue(true);
        renderNavbar();

        const hamburger = screen.getByTestId('lottie-player').parentElement!;
        fireEvent.click(hamburger);

        expect(mockSetHamburgerOpen).toHaveBeenCalledWith(true);
    });

    it('navigates and closes hamburger on mobile selection', () => {
        vi.mocked(utils.useMobile).mockReturnValue(true);
        const props = { ...defaultProps, hamburgerOpen: true };
        renderNavbar(props);

        const aboutLink = screen.getByText('ABOUT');
        fireEvent.click(aboutLink);

        // Should close menu
        expect(mockSetHamburgerOpen).toHaveBeenCalledWith(false);
    });

    it('does not navigate when menu is hidden (pointer-events: none)', () => {
        vi.mocked(utils.useMobile).mockReturnValue(true);
        const props = { ...defaultProps, hamburgerOpen: false }; // Menu closed
        renderNavbar(props);

        const settingsLink = screen.getByText('SETTINGS');
        fireEvent.click(settingsLink);

        // If navigation happened, handleOnNavigate would call setHamburgerOpen(false).
        // Since we are mocking useMobile=true, checking if setHamburgerOpen was called is a proxy for navigation.
        expect(mockSetHamburgerOpen).not.toHaveBeenCalled();
    });
});
