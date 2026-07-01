import type { Character, CharacterSetupData, Topic } from '@shared/ModelTypes';

export const MockFactory = {
    createCharacter: (overrides: Partial<Character> = {}): Character => ({
        id: 'participant-a',
        name: 'Participant A',
        description: 'A council participant',
        prompt: 'Speak as Participant A in the council.',
        voice: 'alloy',
        ...overrides,
    }),

    createPanelist: (indexOrId: number | string = 0, overrides: Partial<Character> = {}): Character => {
        const id = typeof indexOrId === 'number' ? `panelist${indexOrId}` : indexOrId;
        return MockFactory.createCharacter({
            id,
            name: '',
            description: '',
            prompt: '',
            voice: 'alloy',
            ...overrides,
        });
    },

    createTopic: (overrides: Partial<Topic> = {}): Topic => ({
        id: 'pizza',
        title: 'Pizza Council',
        description: 'Discussion about pizza',
        prompt: 'The deliciousness of pizza',
        ...overrides,
    }),

    createCharacterSetupBundle: (overrides: Partial<CharacterSetupData> = {}): CharacterSetupData => ({
        metadata: { version: 'test', last_updated: 'test' },
        panelWithHumans: '',
        addHuman: { id: 'addhuman', name: 'Add Human', description: '' },
        characters: [MockFactory.createCharacter({ id: 'chair', name: 'Chair', description: '', prompt: '' })],
        ...overrides,
    }),
};
