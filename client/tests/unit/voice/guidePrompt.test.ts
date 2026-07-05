import { buildGuidePrompt } from '@voice/guidePrompt';

const topics = [{ id: 't1', title: 'Topic One', description: 'Desc' }];
const characters = [{ id: 'apple', name: 'Apple' }];

describe('buildGuidePrompt', () => {
  it('returns a non-empty string', () => {
    const prompt = buildGuidePrompt({ language: 'en', topics, characters, phase: 'landing' });
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('falls back to English for unknown languages', () => {
    const en = buildGuidePrompt({ language: 'en', topics, characters, phase: 'landing' });
    const fallback = buildGuidePrompt({ language: 'zz', topics, characters, phase: 'landing' });
    expect(fallback).toBe(en);
  });

  it('reflects the visitor name when provided', () => {
    const withName = buildGuidePrompt({ language: 'en', topics, characters, phase: 'landing', visitorName: 'Leo' });
    const withoutName = buildGuidePrompt({ language: 'en', topics, characters, phase: 'landing' });
    expect(withName).toContain('Leo');
    expect(withoutName).not.toContain('Leo');
  });

  it('includes topic titles and character names in the prompt', () => {
    const prompt = buildGuidePrompt({ language: 'en', topics, characters, phase: 'topic' });
    expect(prompt).toContain('Topic One');
    expect(prompt).toContain('Apple');
  });

  it('frames the setup as the Spirit of Asilomar summit', () => {
    const prompt = buildGuidePrompt({ language: 'en', topics, characters, phase: 'landing' });
    expect(prompt).toContain('Spirit of Asilomar summit');
    expect(prompt).toContain('biotechnology, synthetic life');
  });

  it('produces different output per phase', () => {
    const landing = buildGuidePrompt({ language: 'en', topics, characters, phase: 'landing' });
    const chars = buildGuidePrompt({ language: 'en', topics, characters, phase: 'characters' });
    expect(landing).not.toBe(chars);
  });
});
