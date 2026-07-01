import { create } from 'zustand';
import type { Character } from '@shared/ModelTypes';
import { createDefaultHumans } from '@newMeeting/CharacterSetup';
import { CHAIR_ID } from '@/prompts/characterSetupBundles';

export interface MeetingSetupState {
  // Topic State
  selectedTopic: string;
  setSelectedTopic: (topicId: string) => void;
  customTopic: string;
  setCustomTopic: (topic: string) => void;

  // Character Selection State
  selectedCharacters: string[];
  setSelectedCharacters: (characters: string[]) => void;
  hoveredCharacter: string | null;
  setHoveredCharacter: (characterId: string | null) => void;
  handleSelectCharacterId: (characterId: string) => boolean;
  handleDeselectCharacterId: (characterId: string) => void;

  // Human State
  humans: Character[];
  setHumans: (humans: Character[] | ((prev: Character[]) => Character[])) => void;
  numberOfHumans: number;
  setNumberOfHumans: (count: number | ((prev: number) => number)) => void;

  // Visitor name (voice guide audience member, not a council panelist)
  visitorName: string;
  setVisitorName: (name: string) => void;

  // Utilities
  resetStore: () => void;
}

export const useMeetingSetupStore = create<MeetingSetupState>((set, get) => ({
  selectedTopic: '',
  setSelectedTopic: (topicId) => set({ selectedTopic: topicId }),
  
  customTopic: '',
  setCustomTopic: (topic) => set({ customTopic: topic }),

  selectedCharacters: [CHAIR_ID],
  setSelectedCharacters: (characters) => set({ selectedCharacters: characters }),
  hoveredCharacter: null,
  setHoveredCharacter: (characterId) => set({ hoveredCharacter: characterId }),

  handleSelectCharacterId: (characterId) => {
    const { selectedCharacters } = get();
    const maxCharacters = 6 + 1; // 6 plus chair
    if (selectedCharacters.length >= maxCharacters && !selectedCharacters.includes(characterId)) {
      return false;
    }
    set({
      selectedCharacters: selectedCharacters.includes(characterId)
        ? selectedCharacters
        : [...selectedCharacters, characterId],
    });
    return true;
  },

  handleDeselectCharacterId: (characterId) => {
    set((state) => ({
      selectedCharacters: state.selectedCharacters.filter((id) => id !== characterId),
    }));
  },

  humans: createDefaultHumans(),
  setHumans: (humans) => set((state) => ({ 
    humans: typeof humans === 'function' ? humans(state.humans) : humans 
  })),

  numberOfHumans: 0,
  setNumberOfHumans: (count) => set((state) => ({
    numberOfHumans: typeof count === 'function' ? count(state.numberOfHumans) : count
  })),

  visitorName: '',
  setVisitorName: (name) => set({ visitorName: name }),

  resetStore: () => {
    set({
      selectedTopic: '',
      customTopic: '',
      selectedCharacters: [CHAIR_ID],
      hoveredCharacter: null,
      humans: createDefaultHumans(),
      numberOfHumans: 0,
      visitorName: '',
    });
  }
}));
