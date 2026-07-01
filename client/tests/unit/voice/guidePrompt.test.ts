import { buildGuidePrompt } from '@voice/guidePrompt';

const topics = [{ id: 't1', title: 'Topic One', description: 'Desc' }];
const characters = [{ id: 'apple', name: 'Apple' }];

describe('buildGuidePrompt', () => {
  it('uses food selection label on the characters phase', () => {
    const prompt = buildGuidePrompt({ language: 'en', topics, characters, phase: 'characters' });
    expect(prompt).toContain('Current UI step:\nfood selection');
    expect(prompt).toContain('Available foods (id + name):');
    expect(prompt).toContain('- apple: Apple');
  });

  it('uses welcome landing label and landing instructions on the landing phase', () => {
    const prompt = buildGuidePrompt({ language: 'en', topics, characters, phase: 'landing' });
    expect(prompt).toContain('Current UI step:\nwelcome landing');
    expect(prompt).toContain('begin_setup');
    expect(prompt).not.toContain('start_meeting to begin');
  });

  it('includes known visitor name', () => {
    const prompt = buildGuidePrompt({ language: 'en', topics, characters, phase: 'landing', visitorName: 'Leo' });
    expect(prompt).toContain('You already know this visitor as Leo.');
  });

  it('includes unknown visitor guidance when name is missing', () => {
    const prompt = buildGuidePrompt({ language: 'en', topics, characters, phase: 'topic' });
    expect(prompt).toContain("You do not know the visitor's name yet.");
    expect(prompt).toContain('remember_visitor_name');
    expect(prompt).toContain('start_meeting');
  });

  it('mentions other languages once on landing without waiting for an answer', () => {
    const prompt = buildGuidePrompt({ language: 'en', topics, characters, phase: 'landing', otherLanguageNames: ['Swedish'] });
    expect(prompt).toContain('Language options:');
    expect(prompt).toContain('mention once');
    expect(prompt).toContain('Say this aside in English regardless of your current language');
    expect(prompt).toContain('If you prefer Swedish, just let me know.');
    expect(prompt).toContain('Do not pause for an answer');
    expect(prompt).toContain('switch_language');
  });

  it('omits language options on non-landing phases', () => {
    const prompt = buildGuidePrompt({ language: 'en', topics, characters, phase: 'topic', otherLanguageNames: ['Swedish'] });
    expect(prompt).not.toContain('Language options:');
  });

  it('omits language options when no other languages are available', () => {
    const prompt = buildGuidePrompt({ language: 'en', topics, characters, phase: 'landing', otherLanguageNames: [] });
    expect(prompt).not.toContain('Language options:');
  });

  it('uses PTT landing instructions when agentMode is ptt', () => {
    const prompt = buildGuidePrompt({ language: 'en', topics, characters, phase: 'landing', agentMode: 'ptt' });
    expect(prompt).toContain('talk button');
    expect(prompt).toContain('begin_setup');
  });

  it('falls back to English for unknown languages', () => {
    const prompt = buildGuidePrompt({ language: 'zz', topics, characters, phase: 'landing' });
    expect(prompt).toContain('Council of Foods');
  });
});
