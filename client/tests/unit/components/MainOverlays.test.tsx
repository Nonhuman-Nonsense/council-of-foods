import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MainOverlays from '@main/overlay/MainOverlays';
import type { ReactNode } from 'react';
import '@testing-library/jest-dom';
import routes from '@/routes.json';
import { MockFactory } from '../factories/MockFactory';
import { setAppMode, type AppMode } from '@/settings/councilSettings';

// Mock dependencies
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

// Mock React Router
const { mockNavigate, mockLocation } = vi.hoisted(() => ({
    mockNavigate: vi.fn(),
    mockLocation: { hash: '', pathname: '/' }
}));

vi.mock('react-router', () => ({
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation
}));

// Mock Child Components
vi.mock('@main/overlay/About', () => ({ default: () => <div data-testid="about-overlay">About</div> }));
vi.mock('@main/overlay/Contact', () => ({ default: () => <div data-testid="contact-overlay">Contact</div> }));
vi.mock('@main/overlay/Staff', () => ({ default: () => <div data-testid="staff-overlay">Staff</div> }));
vi.mock('@main/overlay/ResetWarning', () => ({
    default: ({ onReset, onCancel }: { onReset: () => void; onCancel: () => void }) => (
        <div data-testid="reset-overlay">
            <button onClick={onReset}>Confirm Reset</button>
            <button onClick={onCancel}>Cancel</button>
        </div>
    )
}));
vi.mock('@newMeeting/SelectTopic', () => ({
    default: () => <div data-testid="settings-overlay">Settings</div>
}));

// Mock Wrapper Components
vi.mock('@main/overlay/Overlay', () => ({
    default: ({ children, isActive }: { children: ReactNode; isActive: boolean }) => isActive ? <div data-testid="overlay-container">{children}</div> : null
}));
vi.mock('@main/overlay/OverlayWrapper', () => ({
    default: ({ children }: { children: ReactNode }) => <div data-testid="overlay-wrapper">{children}</div>
}));

describe('MainOverlays', () => {
    const mockOnReset = vi.fn();
    const mockOnCloseOverlay = vi.fn();
    const topic = MockFactory.createTopic({ id: '1', title: 'Topic A', description: 'Desc A', prompt: '' });

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        mockLocation.hash = '';
        mockLocation.pathname = '/';
    });

    it('renders nothing when hash is empty', () => {
        render(<MainOverlays topic={topic} onReset={mockOnReset} onCloseOverlay={mockOnCloseOverlay} />);
        expect(screen.queryByTestId('overlay-container')).not.toBeInTheDocument();
    });

    it('renders About overlay when hash is #about', () => {
        mockLocation.hash = '#about';
        render(<MainOverlays topic={topic} onReset={mockOnReset} onCloseOverlay={mockOnCloseOverlay} />);
        expect(screen.getByTestId('about-overlay')).toBeInTheDocument();
    });

    it('renders Contact overlay when hash is #contact', () => {
        mockLocation.hash = '#contact';
        render(<MainOverlays topic={topic} onReset={mockOnReset} onCloseOverlay={mockOnCloseOverlay} />);
        expect(screen.getByTestId('contact-overlay')).toBeInTheDocument();
    });

    it('renders Staff overlay when hash is #staff on root', async () => {
        mockLocation.hash = '#staff';
        mockLocation.pathname = '/';
        render(<MainOverlays topic={topic} onReset={mockOnReset} onCloseOverlay={mockOnCloseOverlay} />);
        expect(await screen.findByTestId('staff-overlay')).toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('keeps staff overlay on non-root paths', async () => {
        mockLocation.hash = '#staff';
        mockLocation.pathname = `/${routes.newMeeting}`;
        render(<MainOverlays topic={topic} onReset={mockOnReset} onCloseOverlay={mockOnCloseOverlay} />);
        expect(await screen.findByTestId('staff-overlay')).toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('renders Settings overlay when hash is #settings and path is meeting', () => {
        mockLocation.hash = '#settings';
        mockLocation.pathname = `/${routes.meeting}/123`;
        render(<MainOverlays topic={topic} onReset={mockOnReset} onCloseOverlay={mockOnCloseOverlay} />);
        expect(screen.getByTestId('settings-overlay')).toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('keeps settings overlay on language-prefixed meeting paths', () => {
        mockLocation.hash = '#settings';
        mockLocation.pathname = `/en/${routes.meeting}/123`;
        render(<MainOverlays topic={topic} onReset={mockOnReset} onCloseOverlay={mockOnCloseOverlay} />);
        expect(screen.getByTestId('settings-overlay')).toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('removes settings overlay on non-meeting paths', () => {
        mockLocation.hash = '#settings';
        mockLocation.pathname = `/${routes.newMeeting}`;
        render(<MainOverlays topic={topic} onReset={mockOnReset} onCloseOverlay={mockOnCloseOverlay} />);
        expect(mockNavigate).toHaveBeenCalledWith({ hash: "" });
        expect(mockOnCloseOverlay).toHaveBeenCalled();
    });

    it('renders Reset overlay when hash is #reset', () => {
        mockLocation.hash = '#reset';
        mockLocation.pathname = `/${routes.meeting}`;
        render(<MainOverlays topic={topic} onReset={mockOnReset} onCloseOverlay={mockOnCloseOverlay} />);

        expect(screen.getByTestId('reset-overlay')).toBeInTheDocument();
    });

    it.each([
        { hash: '#about', closes: true },
        { hash: '#contact', closes: true },
        { hash: '#staff', closes: true },
        { hash: '#reset', closes: true },
        { hash: '#warning', closes: true },
        { hash: '#settings', closes: false },
    ])('Escape on $hash closes it: $closes', ({ hash, closes }) => {
        mockLocation.hash = hash;
        mockLocation.pathname = `/${routes.meeting}/123`;
        render(<MainOverlays topic={topic} onReset={mockOnReset} onCloseOverlay={mockOnCloseOverlay} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        if (closes) {
            expect(mockNavigate).toHaveBeenCalledWith({ hash: "" });
            expect(mockOnCloseOverlay).toHaveBeenCalled();
        } else {
            expect(mockNavigate).not.toHaveBeenCalled();
        }
    });

    it.each<{ mode: AppMode; key: { metaKey?: boolean; ctrlKey?: boolean }; opens: boolean }>([
        { mode: 'museum', key: { metaKey: true }, opens: true },
        { mode: 'presenter', key: { metaKey: true }, opens: true },
        { mode: 'museum', key: { ctrlKey: true }, opens: true },
        { mode: 'web', key: { metaKey: true }, opens: false },
    ])('save shortcut in $mode opens the staff page: $opens', ({ mode, key, opens }) => {
        setAppMode(mode);
        render(<MainOverlays topic={topic} onReset={mockOnReset} onCloseOverlay={mockOnCloseOverlay} />);
        const event = new KeyboardEvent('keydown', { code: 'KeyS', key: 's', cancelable: true, ...key });
        window.dispatchEvent(event);
        if (opens) {
            expect(mockNavigate).toHaveBeenCalledWith({ hash: '#staff' });
        } else {
            expect(mockNavigate).not.toHaveBeenCalled();
        }
        // Where it opens staff, the browser's own save dialog must not appear; on the web it must.
        expect(event.defaultPrevented).toBe(opens);
    });

    it('removes overlay if hash is invalid', () => {
        mockLocation.hash = '#invalid';
        render(<MainOverlays topic={topic} onReset={mockOnReset} onCloseOverlay={mockOnCloseOverlay} />);
        expect(mockNavigate).toHaveBeenCalledWith({ hash: "" });
        expect(mockOnCloseOverlay).toHaveBeenCalled();
    });
});
