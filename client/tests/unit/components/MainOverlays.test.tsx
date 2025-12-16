import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MainOverlays from '../../../src/components/MainOverlays';
import React from 'react';
import '@testing-library/jest-dom';
// import { Topic } from '../../../../src/components/settings/SelectTopic';

interface LocalTopic {
    id: string;
    title: string;
    description: string;
}

// Mock dependencies
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
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
    default: (props: any) => (
        <div data-testid="reset-overlay">
            <button onClick={props.onReset}>Confirm Reset</button>
            <button onClick={props.onCancel}>Cancel</button>
        </div>
    )
}));
vi.mock('../../../src/components/settings/SelectTopic', () => ({
    default: (props: any) => <div data-testid="settings-overlay">Settings</div>
}));

// Mock Wrapper Components
vi.mock('../../../src/components/Overlay', () => ({
    default: ({ children, isActive }: { children: React.ReactNode, isActive: boolean }) => isActive ? <div data-testid="overlay-container">{children}</div> : null
}));
vi.mock('../../../src/components/OverlayWrapper', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div data-testid="overlay-wrapper">{children}</div>
}));

describe('MainOverlays', () => {
    const mockOnReset = vi.fn();
    const mockOnCloseOverlay = vi.fn();
    const mockTopics: LocalTopic[] = [{ id: '1', title: 'Topic A', description: 'Desc A' }];
    const mockTopic: LocalTopic = mockTopics[0];

    beforeEach(() => {
        vi.clearAllMocks();
        mockLocation.hash = '';
        mockLocation.pathname = '/';
    });

    it('renders nothing when hash is empty', () => {
        render(<MainOverlays topics={mockTopics} topic={mockTopic} onReset={mockOnReset} onCloseOverlay={mockOnCloseOverlay} />);
        expect(screen.queryByTestId('overlay-container')).not.toBeInTheDocument();
    });

    it('renders About overlay when hash is #about', () => {
        mockLocation.hash = '#about';
        render(<MainOverlays topics={mockTopics} topic={mockTopic} onReset={mockOnReset} onCloseOverlay={mockOnCloseOverlay} />);
        expect(screen.getByTestId('about-overlay')).toBeInTheDocument();
    });

    it('renders Contact overlay when hash is #contact', () => {
        mockLocation.hash = '#contact';
        render(<MainOverlays topics={mockTopics} topic={mockTopic} onReset={mockOnReset} onCloseOverlay={mockOnCloseOverlay} />);
        expect(screen.getByTestId('contact-overlay')).toBeInTheDocument();
    });

    it('renders Settings overlay when hash is #settings and path is meeting', () => {
        mockLocation.hash = '#settings';
        mockLocation.pathname = '/meeting/123';
        render(<MainOverlays topics={mockTopics} topic={mockTopic} onReset={mockOnReset} onCloseOverlay={mockOnCloseOverlay} />);
        expect(screen.getByTestId('settings-overlay')).toBeInTheDocument();
    });

    it('renders Reset overlay when hash is #reset', () => {
        mockLocation.hash = '#reset';
        mockLocation.pathname = '/meeting';
        render(<MainOverlays topics={mockTopics} topic={mockTopic} onReset={mockOnReset} onCloseOverlay={mockOnCloseOverlay} />);
        screen.debug();
        expect(screen.getByTestId('reset-overlay')).toBeInTheDocument();
    });

    it('removes overlay if hash is invalid', () => {
        mockLocation.hash = '#invalid';
        render(<MainOverlays topics={mockTopics} topic={mockTopic} onReset={mockOnReset} onCloseOverlay={mockOnCloseOverlay} />);
        expect(mockNavigate).toHaveBeenCalledWith({ hash: "" });
        expect(mockOnCloseOverlay).toHaveBeenCalled();
    });
});
