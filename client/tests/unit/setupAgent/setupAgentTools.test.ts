import { createSetupAgentToolHandlers, createSetupAgentTools, SetupAgentToolContext } from '@setupAgent/setupAgentTools';
import { useMeetingSetupStore } from '@newMeeting/meetingSetupStore';

const TOPICS = [
  { id: 'topic1', title: 'Topic One', description: 'Desc One' },
];

const CHARACTERS = [
  { id: 'food1', name: 'Food One', description: 'Desc One' },
  { id: 'food2', name: 'Food Two', description: 'Desc Two' },
  { id: 'addhuman', name: 'Add Human', description: 'Add' },
  { id: 'panelist0', name: 'Alice', description: 'Human' },
];

const baseToolParams = {
  otherLanguages: [] as string[],
  topics: [] as typeof TOPICS,
  characters: [] as typeof CHARACTERS,
  agentMode: 'always-on' as const,
};

describe('createSetupAgentTools', () => {
  it('omits switch_language when otherLanguages is empty', () => {
    const tools = createSetupAgentTools(baseToolParams);
    expect(tools.find((t) => t.name === 'switch_language')).toBeUndefined();
  });

  it('includes switch_language with enum when otherLanguages is non-empty', () => {
    const tools = createSetupAgentTools({ ...baseToolParams, otherLanguages: ['sv'] });
    const tool = tools.find((t) => t.name === 'switch_language');
    expect(tool).toBeDefined();
    expect(tool?.parameters?.properties?.language).toMatchObject({ type: 'string', enum: ['sv'] });
  });

  it('builds enum of topic titles for select_topic', () => {
    const tools = createSetupAgentTools({ ...baseToolParams, topics: TOPICS });
    const tool = tools.find((t) => t.name === 'select_topic');
    expect(tool?.parameters?.properties?.title).toMatchObject({ type: 'string', enum: ['Topic One'] });
  });

  it('builds enum of food character names (excluding panelists and addhuman) for select_character', () => {
    const tools = createSetupAgentTools({ ...baseToolParams, characters: CHARACTERS });
    const tool = tools.find((t) => t.name === 'select_character');
    expect(tool?.parameters?.properties?.name).toMatchObject({
      type: 'string',
      enum: ['Food One', 'Food Two'],
    });
  });

  it('omits human_panelist when isWebMode is false', () => {
    const tools = createSetupAgentTools({ ...baseToolParams, isWebMode: false });
    expect(tools.find((t) => t.name === 'human_panelist')).toBeUndefined();
  });

  it('includes human_panelist when isWebMode is true', () => {
    const tools = createSetupAgentTools({ ...baseToolParams, isWebMode: true });
    expect(tools.find((t) => t.name === 'human_panelist')).toBeDefined();
  });

  it('includes a begin_setup tool', () => {
    const tools = createSetupAgentTools(baseToolParams);
    expect(tools.find((t) => t.name === 'begin_setup')).toBeDefined();
  });
});

vi.mock('@newMeeting/meetingSetup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@newMeeting/meetingSetup')>();
  return {
    ...actual,
    buildMeetingCharactersPayload: vi.fn(() => ({
      ok: true as const,
      characters: [{
        id: 'speaker1',
        name: 'Speaker 1',
        description: 'Test speaker',
        prompt: 'Speak',
        voice: 'alloy',
      }],
    })),
  };
});

describe('setupAgentTools', () => {
  let ctx: SetupAgentToolContext;

  beforeEach(() => {
    useMeetingSetupStore.getState().resetStore();
    ctx = {
      topics: TOPICS,
      characters: CHARACTERS,
      goToTopicStep: vi.fn(),
      beginSetup: vi.fn(),
      buildSelectedTopic: vi.fn(),
      selectTopic: vi.fn(),
      startMeeting: vi.fn(),
      meetingStep: 'topic',
      setupAgentLanguage: 'en',
      meetingCharactersLabels: { formatHumanCount: (count) => (count === 1 ? "Human" : `${count} Humans`) },
      otherLanguages: ['sv'],
      switchLanguage: vi.fn(),
    };
  });

  describe('begin_setup', () => {
    it('opens setup from landing and returns step', async () => {
      ctx.meetingStep = 'landing';
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.begin_setup({});
      expect(res).toEqual({ ok: true, data: { step: 'topic' } });
      expect(ctx.beginSetup).toHaveBeenCalledTimes(1);
    });

    it('returns alreadyOnSetup when not on landing', async () => {
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.begin_setup({});
      expect(res).toEqual({ ok: true, data: { alreadyOnSetup: true, currentStep: 'topic' } });
      expect(ctx.beginSetup).not.toHaveBeenCalled();
    });
  });

  describe('select_topic', () => {
    it('highlights the topic in the UI and returns its details', async () => {
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.select_topic({ title: 'Topic One' });
      expect(res).toEqual({
        ok: true,
        data: { title: 'Topic One', description: 'Desc One' },
      });
      expect(useMeetingSetupStore.getState().selectedTopic).toBe('topic1');
    });

    it('returns error if title is missing', async () => {
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.select_topic({});
      expect(res).toEqual({ ok: false, error: 'Missing title' });
    });

    it('returns error if title is unknown', async () => {
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.select_topic({ title: 'No Such Topic' });
      expect(res).toEqual({ ok: false, error: 'Unknown topic: No Such Topic' });
    });

    it('calls beginSetup when called from landing', async () => {
      ctx.meetingStep = 'landing';
      const handlers = createSetupAgentToolHandlers(ctx);
      await handlers.select_topic({ title: 'Topic One' });
      expect(ctx.beginSetup).toHaveBeenCalledTimes(1);
    });
  });

  describe('confirm_topic', () => {
    it('confirms a selected topic and advances', async () => {
      useMeetingSetupStore.getState().setSelectedTopic('topic1');
      vi.mocked(ctx.buildSelectedTopic).mockReturnValue({
        id: 'topic1',
        title: 'Topic One',
        description: 'Desc One',
        prompt: 'Prompt',
      });
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.confirm_topic({});
      expect(res).toEqual({ ok: true, data: { title: 'Topic One' } });
      expect(ctx.selectTopic).toHaveBeenCalledTimes(1);
    });

    it('returns error if no topic is selected', async () => {
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.confirm_topic({});
      expect(res).toEqual({
        ok: false,
        error: 'No topic is selected yet. Ask the visitor to pick a topic first.',
      });
      expect(ctx.selectTopic).not.toHaveBeenCalled();
    });

    it('returns error if custom topic has no text', async () => {
      useMeetingSetupStore.getState().setSelectedTopic('customtopic');
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.confirm_topic({});
      expect(res).toMatchObject({ ok: false });
      expect((res as { ok: false; error: string }).error).toMatch(/custom topic/i);
    });
  });

  describe('set_custom_topic', () => {
    it('selects custom topic and stores the text', async () => {
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.set_custom_topic({ text: 'Biodiversity loss' });
      expect(res).toEqual({ ok: true, data: { text: 'Biodiversity loss' } });
      expect(useMeetingSetupStore.getState().selectedTopic).toBe('customtopic');
      expect(useMeetingSetupStore.getState().customTopic).toBe('Biodiversity loss');
    });

    it('returns error if text is missing', async () => {
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.set_custom_topic({});
      expect(res).toEqual({ ok: false, error: 'Missing text' });
    });
  });

  describe('current_topic', () => {
    it('returns null when nothing is selected', async () => {
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.current_topic({});
      expect(res).toEqual({ ok: true, data: { selected: null } });
    });

    it('returns title when a topic is selected', async () => {
      useMeetingSetupStore.getState().setSelectedTopic('topic1');
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.current_topic({});
      expect(res).toEqual({ ok: true, data: { selected: 'Topic One' } });
    });

    it('returns custom topic text when custom topic is selected', async () => {
      useMeetingSetupStore.getState().setSelectedTopic('customtopic');
      useMeetingSetupStore.getState().setCustomTopic('Plastic waste');
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.current_topic({});
      expect(res).toEqual({ ok: true, data: { selected: 'Plastic waste', isCustom: true } });
    });
  });

  describe('go_to_topic_step', () => {
    it('should call the topic-step callback', async () => {
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.go_to_topic_step({});
      expect(res).toEqual({ ok: true });
      expect(ctx.goToTopicStep).toHaveBeenCalledTimes(1);
    });

    it('should call beginSetup from landing', async () => {
      ctx.meetingStep = 'landing';
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.go_to_topic_step({});
      expect(res).toEqual({ ok: true });
      expect(ctx.beginSetup).toHaveBeenCalledTimes(1);
      expect(ctx.goToTopicStep).not.toHaveBeenCalled();
    });
  });

  describe('select_character', () => {
    beforeEach(() => { ctx.meetingStep = 'characters'; });

    it('selects a character by name and returns details', async () => {
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.select_character({ name: 'Food One' });
      expect(res).toEqual({ ok: true, data: { name: 'Food One', description: 'Desc One' } });
      expect(useMeetingSetupStore.getState().selectedCharacters).toContain('food1');
      expect(useMeetingSetupStore.getState().hoveredCharacter).toBe('food1');
    });

    it('returns error if name is missing', async () => {
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.select_character({});
      expect(res).toEqual({ ok: false, error: 'Missing name' });
    });

    it('returns error if name is unknown', async () => {
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.select_character({ name: 'Unknown Food' });
      expect(res).toEqual({ ok: false, error: 'Unknown character: Unknown Food' });
    });

    it('returns error when maximum characters already selected', async () => {
      useMeetingSetupStore.getState().setSelectedCharacters(['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7']);
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.select_character({ name: 'Food Two' });
      expect(res).toEqual({ ok: false, error: 'Maximum number of characters (6 plus the chair) already selected.' });
    });

    it('returns error when not on character step', async () => {
      ctx.meetingStep = 'topic';
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.select_character({ name: 'Food One' });
      expect(res).toMatchObject({ ok: false });
    });
  });

  describe('deselect_character', () => {
    beforeEach(() => { ctx.meetingStep = 'characters'; });

    it('deselects a character by name', async () => {
      useMeetingSetupStore.getState().setSelectedCharacters(['CHAIR_ID', 'food1']);
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.deselect_character({ name: 'Food One' });
      expect(res).toEqual({ ok: true, data: { name: 'Food One' } });
      expect(useMeetingSetupStore.getState().selectedCharacters).not.toContain('food1');
    });

    it('returns error if name is missing', async () => {
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.deselect_character({});
      expect(res).toEqual({ ok: false, error: 'Missing name' });
    });

    it('returns error if name is unknown', async () => {
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.deselect_character({ name: 'Ghost Food' });
      expect(res).toEqual({ ok: false, error: 'Unknown character: Ghost Food' });
    });
  });

  describe('current_characters', () => {
    it('returns empty lists when nothing is selected', async () => {
      ctx.meetingStep = 'characters';
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.current_characters({});
      expect(res).toEqual({ ok: true, data: { characters: [], humans: [] } });
    });

    it('returns selected character names (excluding chair and panelists)', async () => {
      ctx.meetingStep = 'characters';
      useMeetingSetupStore.getState().setSelectedCharacters(['CHAIR_ID', 'food1', 'food2']);
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.current_characters({});
      expect(res).toEqual({ ok: true, data: { characters: ['Food One', 'Food Two'], humans: [] } });
    });
  });

  describe('remember_visitor_name', () => {
    it('stores a normalized visitor name', async () => {
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.remember_visitor_name({ name: '  leo  ' });
      expect(res).toEqual({ ok: true, data: { name: 'Leo' } });
      expect(useMeetingSetupStore.getState().visitorName).toBe('Leo');
    });

    it('rejects empty names', async () => {
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.remember_visitor_name({ name: '   ' });
      expect(res).toEqual({ ok: false, error: 'Name cannot be empty.' });
    });

    it('rejects names that collide with council participants', async () => {
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.remember_visitor_name({ name: 'Food One' });
      expect(res).toEqual({
        ok: false,
        error: 'That name is already used by a council participant. Ask for a different name.',
      });
    });
  });

  describe('switch_language', () => {
    it('calls switchLanguage and suppresses continuation', async () => {
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.switch_language({ language: 'sv' });
      expect(res).toEqual({ ok: true, suppressContinuation: true });
      expect(ctx.switchLanguage).toHaveBeenCalledWith('sv');
    });

    it('rejects a language not in otherLanguages', async () => {
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.switch_language({ language: 'de' });
      expect(res).toEqual({ ok: false, error: 'Language not available: de' });
      expect(ctx.switchLanguage).not.toHaveBeenCalled();
    });

    it('rejects when language arg is missing', async () => {
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.switch_language({});
      expect(res).toEqual({ ok: false, error: 'Missing language' });
    });
  });

  describe('start_meeting', () => {
    beforeEach(() => {
      ctx.meetingStep = 'characters';
      useMeetingSetupStore.getState().setSelectedCharacters(['food1', 'food2', 'food3']);
    });

    it('refuses to start without a visitor name', async () => {
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.start_meeting({});
      expect(res).toEqual({
        ok: false,
        error:
          "Learn the visitor's name first and call remember_visitor_name before start_meeting. Ask casually until they tell you.",
      });
      expect(ctx.startMeeting).not.toHaveBeenCalled();
    });

    it('starts when the visitor name is known', async () => {
      useMeetingSetupStore.getState().setVisitorName('Leo');
      vi.mocked(ctx.buildSelectedTopic).mockReturnValue({
        id: 'topic1',
        title: 'Topic One',
        description: 'Desc One',
        prompt: 'Prompt',
      });
      const handlers = createSetupAgentToolHandlers(ctx);
      const res = await handlers.start_meeting({});
      expect(res).toEqual({
        ok: true,
        data: {
          started: true,
          visitorName: 'Leo',
        },
      });
      expect(ctx.startMeeting).toHaveBeenCalledTimes(1);
    });
  });
});
