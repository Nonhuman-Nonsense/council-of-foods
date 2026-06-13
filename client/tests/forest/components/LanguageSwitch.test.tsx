import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import Main from '@main/Main';
import SelectCharacters from '@newMeeting/SelectCharacters';
import i18n from '@/i18n';
import { useMeetingSetupStore } from '@stores/useMeetingSetupStore';
import { getTopicsBundle } from '@main/topicsBundle';
import { getCharacterSetupBundle } from '@newMeeting/CharacterSetup';
import { MockFactory } from '../../unit/factories/MockFactory';

const EN_TOPIC_TITLE = 'Test English Topic';
const SV_TOPIC_TITLE = 'Test Swedish Topic';

const mockEnTopicsBundle = {
    metadata: { version: 'test', last_updated: 'test' },
    system: 'System [TOPIC]',
    custom_topic: MockFactory.createTopic({ id: 'customtopic', title: 'Custom Topic' }),
    topics: [
        MockFactory.createTopic({ id: 'greentransition', title: EN_TOPIC_TITLE }),
    ],
};

const mockSvTopicsBundle = {
    metadata: { version: 'test', last_updated: 'test' },
    system: 'System [TOPIC]',
    custom_topic: MockFactory.createTopic({ id: 'customtopic', title: 'Eget Ämne' }),
    topics: [
        MockFactory.createTopic({ id: 'greentransition', title: SV_TOPIC_TITLE }),
    ],
};

const mockEnCharacterBundle = MockFactory.createCharacterSetupBundle({
    characters: [
        MockFactory.createCharacter({ id: 'river', name: 'The River' }),
        MockFactory.createCharacter({ id: 'salmon', name: 'The Salmon' }),
        MockFactory.createCharacter({ id: 'pine', name: 'The Pine' }),
    ],
});

const mockSvCharacterBundle = MockFactory.createCharacterSetupBundle({
    characters: [
        MockFactory.createCharacter({ id: 'river', name: 'Älven' }),
        MockFactory.createCharacter({ id: 'salmon', name: 'Laxen' }),
        MockFactory.createCharacter({ id: 'pine', name: 'Tallen' }),
    ],
});

vi.mock('@forest/Forest', () => ({
    default: () => <div data-testid="mock-forest">Forest Component</div>
}));
vi.mock('@voice/MeetingVoiceGuide', () => ({
    default: () => null,
}));

vi.mock('@main/topicsBundle', () => ({
    getTopicsBundle: vi.fn(),
}));

vi.mock('@newMeeting/CharacterSetup', () => ({
    getCharacterSetupBundle: vi.fn(),
    createDefaultHumans: vi.fn(() => []),
    createHuman: vi.fn(),
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

        vi.mocked(getTopicsBundle).mockImplementation((lang) =>
            lang === 'sv' ? mockSvTopicsBundle : mockEnTopicsBundle
        );
        vi.mocked(getCharacterSetupBundle).mockImplementation((lang) =>
            lang === 'sv' ? mockSvCharacterBundle : mockEnCharacterBundle
        );

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

        window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
        window.HTMLMediaElement.prototype.pause = vi.fn();
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
            expect(screen.getByText(SV_TOPIC_TITLE)).toBeInTheDocument();
        });
        expect(getTopicsBundle).toHaveBeenCalledWith('sv');
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
            expect(screen.getByText(EN_TOPIC_TITLE)).toBeInTheDocument();
        });
        expect(getTopicsBundle).toHaveBeenCalledWith('en');

        fireEvent.click(screen.getByText('SV'));

        await waitFor(() => {
            expect(screen.getByText(SV_TOPIC_TITLE)).toBeInTheDocument();
        });
        expect(getTopicsBundle).toHaveBeenCalledWith('sv');
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
        expect(getCharacterSetupBundle).toHaveBeenCalledWith('sv');

        const tall = screen.getByAltText('Tallen');
        fireEvent.click(screen.getByAltText('Laxen'));
        fireEvent.click(tall);

        fireEvent.click(screen.getByText('Starta'));
    });
});
