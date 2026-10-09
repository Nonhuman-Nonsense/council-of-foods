import { buildSetupAgentPrompt } from '@setupAgent/setupAgentPrompt';

const topics = [{ id: 't1', title: 'Topic One', description: 'Desc', agentBrief: 'Brief' }];
const characters = [{ id: 'apple', name: 'Apple' }];

describe('buildSetupAgentPrompt', () => {
  it('returns a non-empty string', () => {
    const prompt = buildSetupAgentPrompt({ language: 'en', topics, characters, phase: 'landing' });
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('falls back to English for unknown languages', () => {
    const en = buildSetupAgentPrompt({ language: 'en', topics, characters, phase: 'landing' });
    const fallback = buildSetupAgentPrompt({ language: 'zz', topics, characters, phase: 'landing' });
    expect(fallback).toBe(en);
  });

  it('reflects the visitor name when provided', () => {
    const withName = buildSetupAgentPrompt({ language: 'en', topics, characters, phase: 'landing', visitorName: 'Leo' });
    const withoutName = buildSetupAgentPrompt({ language: 'en', topics, characters, phase: 'landing' });
    expect(withName).toContain('Leo');
    expect(withoutName).not.toContain('Leo');
  });

  it('includes topic titles and character names in the prompt', () => {
    const prompt = buildSetupAgentPrompt({ language: 'en', topics, characters, phase: 'topic' });
    expect(prompt).toContain('Topic One');
    expect(prompt).toContain('Apple');
  });

  /**
   * What the prompt *says* about the microphone is copy, and rewording it must
   * not break tests. That the mic context reaches the prompt at all is the
   * contract worth holding: without it the agent would talk to a visitor who
   * cannot answer.
   */
  it('varies with the microphone context it is given', () => {
    const base = { language: 'en', topics, characters, phase: 'topic' as const };
    const hasSpoken = buildSetupAgentPrompt({ ...base, hasEverHeardVisitor: true });
    const neverSpoken = buildSetupAgentPrompt({ ...base, hasEverHeardVisitor: false });

    expect(neverSpoken).not.toBe(hasSpoken);
  });

  it('defaults to a hearing agent so museum is unaffected', () => {
    const explicit = buildSetupAgentPrompt({
      language: 'en', topics, characters, phase: 'topic', hasEverHeardVisitor: true,
    });
    const implicit = buildSetupAgentPrompt({ language: 'en', topics, characters, phase: 'topic' });

    expect(implicit).toBe(explicit);
  });

  it('produces different output per phase', () => {
    const landing = buildSetupAgentPrompt({ language: 'en', topics, characters, phase: 'landing' });
    const chars = buildSetupAgentPrompt({ language: 'en', topics, characters, phase: 'characters' });
    expect(landing).not.toBe(chars);
  });

  /**
   * A session can start after the visitor has already chosen — they turn the
   * agent on mid-setup, or it reconnects — and the reactions to those clicks
   * never reached it. Wording is copy; what is held here is that the choices
   * reach the prompt on the steps where they exist. Names are counted rather
   * than looked for, since every being's name is in the prompt anyway as one
   * the visitor can pick.
   */
  describe('choices already made when the session starts', () => {
    const roster = [{ id: 'apple', name: 'Apple' }, { id: 'pear', name: 'Pear' }];
    const selection = { topic: 'Who owns the rain?', council: ['Pear'] };
    const count = (text: string, name: string) => text.split(name).length - 1;

    it.each([
      { phase: 'landing' as const, topic: false, council: false },
      { phase: 'topic' as const, topic: true, council: false },
      { phase: 'characters' as const, topic: true, council: true },
    ])('$phase step: topic $topic, council $council', ({ phase, topic, council }) => {
      for (const language of ['en', 'sv']) {
        const base = { language, topics, characters: roster, phase };
        const without = buildSetupAgentPrompt(base);
        const withSelection = buildSetupAgentPrompt({ ...base, selection });

        expect(withSelection.includes(selection.topic)).toBe(topic);
        expect(count(withSelection, 'Pear') > count(without, 'Pear')).toBe(council);
        expect(count(withSelection, 'Apple')).toBe(count(without, 'Apple'));
      }
    });
  });

  /** Without them the agent has to guess that a visitor saying "biet" means Humlan. */
  it.each(['en', 'sv'])('%s: lists the everyday names visitors use for a character', (language) => {
    const withAliases = [{ id: 'apple', name: 'Apple', aliases: ['Crunchy'] }];
    const prompt = buildSetupAgentPrompt({ language, topics, characters: withAliases, phase: 'characters' });
    expect(prompt).toContain('Crunchy');
  });
});
