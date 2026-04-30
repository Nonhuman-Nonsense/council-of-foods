import type { Character, CharacterSetupData, Topic } from '@shared/ModelTypes';

export const MockFactory = {
    createCharacter: (overrides: Partial<Character> = {}): Character => ({
        id: 'potato',
        name: 'Potato',
        description: 'A starchy root vegetable',
        prompt: 'Speak as Potato in the council.',
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
        characters: [MockFactory.createCharacter({ id: 'water', name: 'Water', description: '', prompt: '' })],
        ...overrides,
    }),
};
