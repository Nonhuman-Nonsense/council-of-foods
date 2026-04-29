import { create } from 'zustand';
import type { Food } from '../components/settings/FoodUtils';
import { createDefaultHumans } from '../components/settings/FoodUtils';
import { globalClientOptions } from '../globalClientOptions';

export interface MeetingSetupState {
  // Topic State
  selectedTopic: string;
  setSelectedTopic: (topicId: string) => void;
  customTopic: string;
  setCustomTopic: (topic: string) => void;
  hoveredTopic: string | null;
  setHoveredTopic: (topicId: string | null) => void;

  // Foods State
  selectedFoods: string[];
  setSelectedFoods: (foods: string[]) => void;
  hoveredFood: string | null;
  setHoveredFood: (foodId: string | null) => void;
  handleSelectFoodId: (foodId: string) => boolean;
  handleDeselectFoodId: (foodId: string) => void;

  // Human State
  humans: Food[];
  setHumans: (humans: Food[] | ((prev: Food[]) => Food[])) => void;
  numberOfHumans: number;
  setNumberOfHumans: (count: number | ((prev: number) => number)) => void;

  // Utilities
  resetStore: () => void;
}

export const useMeetingSetupStore = create<MeetingSetupState>((set, get) => ({
  selectedTopic: '',
  setSelectedTopic: (topicId) => set({ selectedTopic: topicId }),
  
  customTopic: '',
  setCustomTopic: (topic) => set({ customTopic: topic }),
  
  hoveredTopic: null,
  setHoveredTopic: (topicId) => set({ hoveredTopic: topicId }),

  selectedFoods: [globalClientOptions.chairId],
  setSelectedFoods: (foods) => set({ selectedFoods: foods }),
  hoveredFood: null,
  setHoveredFood: (foodId) => set({ hoveredFood: foodId }),

  handleSelectFoodId: (foodId) => {
    const { selectedFoods } = get();
    const maxFoods = 6 + 1; // 6 plus chair
    if (selectedFoods.length >= maxFoods && !selectedFoods.includes(foodId)) {
      return false;
    }
    set({ selectedFoods: selectedFoods.includes(foodId) ? selectedFoods : [...selectedFoods, foodId] });
    return true;
  },

  handleDeselectFoodId: (foodId) => {
    set((state) => ({
      selectedFoods: state.selectedFoods.filter((id) => id !== foodId)
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

  resetStore: () => {
    set({
      selectedTopic: '',
      customTopic: '',
      hoveredTopic: null,
      selectedFoods: [globalClientOptions.chairId],
      hoveredFood: null,
      humans: createDefaultHumans(),
      numberOfHumans: 0,
    });
  }
}));
