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

  it('produces different output per phase', () => {
    const landing = buildSetupAgentPrompt({ language: 'en', topics, characters, phase: 'landing' });
    const chars = buildSetupAgentPrompt({ language: 'en', topics, characters, phase: 'characters' });
    expect(landing).not.toBe(chars);
  });
});
