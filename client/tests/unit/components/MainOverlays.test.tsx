import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import MainOverlays from '../../../src/components/MainOverlays';
import type { ReactNode } from 'react';
import '@testing-library/jest-dom';
import routes from '../../../src/routes.json';
import type { Topic } from '@shared/ModelTypes';

const mockTopic = (partial: Pick<Topic, 'id' | 'title' | 'description'> & Partial<Topic>): Topic => ({
    prompt: '',
    ...partial,
});

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
vi.mock('../../../src/components/overlays/About', () => ({ default: () => <div data-testid="about-overlay">About</div> }));
vi.mock('../../../src/components/overlays/Contact', () => ({ default: () => <div data-testid="contact-overlay">Contact</div> }));
vi.mock('../../../src/components/overlays/ResetWarning', () => ({
    default: ({ onReset, onCancel }: { onReset: () => void; onCancel: () => void }) => (
        <div data-testid="reset-overlay">
            <button onClick={onReset}>Confirm Reset</button>
            <button onClick={onCancel}>Cancel</button>
        </div>
    )
}));
vi.mock('../../../src/components/settings/SelectTopic', () => ({
    default: () => <div data-testid="settings-overlay">Settings</div>
}));

// Mock Wrapper Components
vi.mock('../../../src/components/Overlay', () => ({
    default: ({ children, isActive }: { children: ReactNode; isActive: boolean }) => isActive ? <div data-testid="overlay-container">{children}</div> : null
}));
vi.mock('../../../src/components/OverlayWrapper', () => ({
    default: ({ children }: { children: ReactNode }) => <div data-testid="overlay-wrapper">{children}</div>
}));

describe('MainOverlays', () => {
    const mockOnReset = vi.fn();
    const mockOnCloseOverlay = vi.fn();
    const topic: Topic = mockTopic({ id: '1', title: 'Topic A', description: 'Desc A' });

    beforeEach(() => {
        vi.clearAllMocks();
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

    it('removes overlay if hash is invalid', () => {
        mockLocation.hash = '#invalid';
        render(<MainOverlays topic={topic} onReset={mockOnReset} onCloseOverlay={mockOnCloseOverlay} />);
        expect(mockNavigate).toHaveBeenCalledWith({ hash: "" });
        expect(mockOnCloseOverlay).toHaveBeenCalled();
    });
});
