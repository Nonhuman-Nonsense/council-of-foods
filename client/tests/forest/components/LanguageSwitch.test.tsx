import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import Main from '@main/Main';
import SelectCharacters from '@newMeeting/SelectCharacters';
import i18n from '@/i18n';
import { useMeetingSetupStore } from '@stores/useMeetingSetupStore';

vi.mock('@forest/Forest', () => ({
    default: () => <div data-testid="mock-forest">Forest Component</div>
}));
vi.mock('@voice/MeetingVoiceGuide', () => ({
    default: () => null,
}));

vi.mock('@/utils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/utils')>();
    return {
        ...actual,
        useMobile: () => false,
        useMobileXs: () => false,
        usePortrait: () => false,
        useDocumentVisibility: () => true,
        dvh: (v: unknown) => v,
    };
});

function MainByLangParam() {
    const { lang } = useParams();
    return <Main lang={lang ?? 'en'} />;
}

describe('Language Switching', () => {
    beforeEach(() => {
        useMeetingSetupStore.getState().resetStore();
        void i18n.changeLanguage('en');

        window.AudioContext = class {
            constructor() {
                this.state = 'running';
                this.destination = {};
                this.currentTime = 0;
            }
            createGain() {
                return {
                    connect: vi.fn(),
                    gain: {
                        value: 1,
                        linearRampToValueAtTime: vi.fn(),
                        setValueAtTime: vi.fn()
                    }
                };
            }
            createBufferSource() {
                return {
                    connect: vi.fn(),
                    start: vi.fn(),
                    stop: vi.fn(),
                    buffer: null,
                    loop: false
                };
            }
            decodeAudioData() {
                return Promise.resolve({});
            }
            suspend() { }
            resume() { }
        } as unknown as typeof AudioContext;
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext = window.AudioContext;
    });

    it('loads Swedish topics when Main is mounted with lang sv', async () => {
        render(
            <MemoryRouter initialEntries={['/sv/new']}>
                <Routes>
                    <Route path="/:lang/*" element={<MainByLangParam />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(
                screen.getByText('Den Gröna Omställningen Och Kumulativa Effekter.')
            ).toBeInTheDocument();
        });
    });

    it('switches topic language when clicking the SV link in the navbar', async () => {
        render(
            <MemoryRouter initialEntries={['/en/new']}>
                <Routes>
                    <Route path="/:lang/*" element={<MainByLangParam />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Green Transition')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('SV'));

        await waitFor(() => {
            expect(
                screen.getByText('Den Gröna Omställningen Och Kumulativa Effekter.')
            ).toBeInTheDocument();
        });
    });

    it('shows Swedish food names on SelectCharacters when language is sv', async () => {
        window.scrollTo = vi.fn();
        await i18n.changeLanguage('sv');

        render(
            <MemoryRouter initialEntries={['/sv/new']}>
                <SelectCharacters topicTitle="Testämne" onContinueForward={() => { }} />
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByAltText('Laxen')).toBeInTheDocument();
        });

        const tall = screen.getByAltText('Tallen');
        fireEvent.click(screen.getByAltText('Laxen'));
        fireEvent.click(tall);

        fireEvent.click(screen.getByText('Starta'));
    });
});
