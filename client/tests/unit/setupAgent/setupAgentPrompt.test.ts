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

  it('tells the agent it cannot be answered when the mic is off', () => {
    const canHear = buildSetupAgentPrompt({ language: 'en', topics, characters, phase: 'topic' });
    const cannotHear = buildSetupAgentPrompt({
      language: 'en', topics, characters, phase: 'topic', canHearVisitor: false,
    });

    expect(cannotHear).not.toBe(canHear);
    // The failure this guards against is the agent asking a question and then
    // waiting forever for a visitor who has no microphone.
    expect(cannotHear.toLowerCase()).toContain('the mic is off');
    expect(cannotHear.toLowerCase()).toContain('cannot hear them');
  });

  it('describes both modes whichever one is live', () => {
    // The agent has to know the mic can be switched, or the switch arrives as
    // an unexplained personality change mid-session.
    for (const canHearVisitor of [true, false]) {
      const prompt = buildSetupAgentPrompt({
        language: 'en', topics, characters, phase: 'topic', canHearVisitor,
      });

      expect(prompt.toLowerCase(), String(canHearVisitor)).toContain('turn the microphone on and off');
      expect(prompt.toLowerCase(), String(canHearVisitor)).toContain('when it is on');
      expect(prompt.toLowerCase(), String(canHearVisitor)).toContain('when it is off');
    }
  });

  it('points the agent at the conversation for the live mic state', () => {
    // The prompt is only ever sent when a session connects, so it describes the
    // start of the session; every change after that arrives as a message.
    const prompt = buildSetupAgentPrompt({
      language: 'en', topics, characters, phase: 'topic', canHearVisitor: false,
    });

    expect(prompt.toLowerCase()).toContain('when this session started');
    expect(prompt.toLowerCase()).toContain('most recent notice');
  });

  it('keeps the phase jobs and the setup lists in both modes', () => {
    // One prompt, not two: commentary still needs the topics, the foods and the
    // phase it is in.
    const prompt = buildSetupAgentPrompt({
      language: 'en', topics, characters, phase: 'characters', canHearVisitor: false,
    });

    expect(prompt).toContain('Topic One');
    expect(prompt).toContain('Apple');
    expect(prompt).toContain('characters phase');
  });

  it('invites the visitor to the microphone only until they have used it', () => {
    const neverSpoken = buildSetupAgentPrompt({
      language: 'en', topics, characters, phase: 'topic',
      canHearVisitor: false, hasEverHeardVisitor: false,
    });
    const spokenBefore = buildSetupAgentPrompt({
      language: 'en', topics, characters, phase: 'topic',
      canHearVisitor: false, hasEverHeardVisitor: true,
    });

    expect(neverSpoken).toContain('microphone button');
    expect(spokenBefore).not.toContain('microphone button');
  });

  it('defaults to a hearing agent so museum is unaffected', () => {
    const explicit = buildSetupAgentPrompt({
      language: 'en', topics, characters, phase: 'topic', canHearVisitor: true,
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
