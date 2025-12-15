import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Main from '../../../src/components/Main';
import topicDataEN from '../../../src/prompts/topics_en.json';

// Mock Child Components
vi.mock('../../../src/components/settings/Landing', () => ({ default: () => <div data-testid="landing">Landing</div> }));
vi.mock('../../../src/components/settings/SelectFoods', () => ({ default: () => <div data-testid="select-foods">SelectFoods</div> }));
vi.mock('../../../src/components/Council', () => ({ default: () => <div data-testid="council">Council</div> }));
vi.mock('../../../src/components/Navbar', () => ({ default: () => <div data-testid="navbar">Navbar</div> }));
vi.mock('../../../src/components/Overlay', () => ({ default: ({ children }) => <div data-testid="overlay">{children}</div> }));
vi.mock('../../../src/components/MainOverlays', () => ({ default: () => <div data-testid="main-overlays">MainOverlays</div> }));

// Mock SelectTopic to capture props
const SelectTopicMock = vi.fn(({ topics }) => (
    <div data-testid="select-topic">
        {topics.map(t => <span key={t.id} data-testid="topic-item">{t.title}</span>)}
    </div>
));

vi.mock('../../../src/components/settings/SelectTopic', () => ({
    default: (props) => SelectTopicMock(props)
}));


// Mocks for utils
vi.mock('../../../src/utils', () => ({
    useMobile: () => false,
    useMobileXs: () => false,
    usePortrait: () => false,
    dvh: 'vh'
}));

describe('Main Component Integration', () => {

    it('loads topics correctly from JSON and passes them to SelectTopic', () => {
        render(
            <MemoryRouter initialEntries={['/topics']}>
                <Main lang="en" />
            </MemoryRouter>
        );

        // Verify SelectTopic is rendered
        expect(screen.getByTestId('select-topic')).toBeInTheDocument();

        // Get the calls to the mock
        const lastCall = SelectTopicMock.mock.lastCall;
        const props = lastCall[0];

        // Assertions
        expect(props.topics).toBeDefined();
        expect(Array.isArray(props.topics)).toBe(true);

        // The regression check: 
        // Ensure we have the correct number of topics (excluding/including custom as handled by logic)
        // topicDataEN.topics includes "Custom Topic", likely handled by Main's initialization
        expect(props.topics.length).toBe(topicDataEN.topics.length);

        // Verify specifically that we don't have malformed objects
        // (If Object.values(topicDataEN) was used, we'd get "system" string as a "topic" potentially, or just garbage)
        const firstTopicId = topicDataEN.topics[0].id;
        const matchingTopic = props.topics.find(t => t.id === firstTopicId);
        expect(matchingTopic).toBeDefined();
        expect(matchingTopic.title).toBe(topicDataEN.topics[0].title);
    });
});
