import { buildSetupAgentPrompt } from '@setupAgent/setupAgentPrompt';

const topics = [{ id: 't1', title: 'Topic One', description: 'Desc' }];
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
});
