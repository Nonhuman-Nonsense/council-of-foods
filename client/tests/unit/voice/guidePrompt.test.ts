import { buildGuidePrompt } from '@voice/guidePrompt';
import type { VoiceGuidePromptBundle } from '@voice/guidePrompt';

const baseBundle: VoiceGuidePromptBundle = {
  system: 'You are Water.',
  projectDescription: 'Council of Foods setup.',
  characterVocabulary: {
    singular: 'food',
    plural: 'foods',
    stepLabel: 'food selection',
  },
  landingJobInstructions: ['Welcome the visitor.'],
  landingJobInstructionsPushToTalk: ['Explain push-to-talk.'],
  jobInstructions: ['Help pick foods.'],
  toolDescriptions: {},
};

describe('buildGuidePrompt', () => {
  it('uses domain vocabulary in the assembled prompt', () => {
    const prompt = buildGuidePrompt({
      bundle: baseBundle,
      topics: [{ id: 't1', title: 'Topic One' }],
      characters: [{ id: 'apple', name: 'Apple' }],
      phase: 'characters',
    });

    expect(prompt).toContain('Current UI step:\nfood selection');
    expect(prompt).toContain('Available foods (id + name):');
    expect(prompt).toContain('- apple: Apple');
    expect(prompt).toContain('- Help pick foods.');
  });

  it('uses landing instructions on the landing phase', () => {
    const prompt = buildGuidePrompt({
      bundle: baseBundle,
      topics: [],
      characters: [],
      phase: 'landing',
    });

    expect(prompt).toContain('Current UI step:\nwelcome landing');
    expect(prompt).toContain('- Welcome the visitor.');
    expect(prompt).not.toContain('- Help pick foods.');
  });
});
