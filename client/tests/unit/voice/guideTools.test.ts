import { createGuideToolHandlers, GuideToolContext } from '@voice/guideTools';
import { useMeetingSetupStore } from '@stores/useMeetingSetupStore';

describe('guideTools', () => {
  let ctx: GuideToolContext;

  beforeEach(() => {
    useMeetingSetupStore.getState().resetStore();
    ctx = {
      topics: [
        { id: 'topic1', title: 'Topic One', description: 'Desc One' }
      ],
      characters: [
        { id: 'food1', name: 'Food One', description: 'Desc One' },
        { id: 'food2', name: 'Food Two', description: 'Desc Two' },
        { id: 'addhuman', name: 'Add Human', description: 'Add' },
        { id: 'panelist0', name: 'Alice', description: 'Human' }
      ],
      goToTopicStep: vi.fn(),
      beginSetup: vi.fn(),
      buildSelectedTopic: vi.fn(),
      selectTopic: vi.fn(),
      startMeeting: vi.fn(),
      meetingStep: 'topic',
      voiceGuideLanguage: 'en',
      meetingCharactersLabels: { oneHuman: 'Human', twoHumansSuffix: ' Humans' }
    };
  });

  describe('describe_topic', () => {
    it('should select the topic in the UI and return its details', async () => {
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.describe_topic({ topicId: 'topic1' });
      expect(res).toEqual({
        ok: true,
        data: { id: 'topic1', title: 'Topic One', description: 'Desc One' }
      });
      expect(useMeetingSetupStore.getState().selectedTopic).toBe('topic1');
    });
  });

  describe('select_topic', () => {
    it('should select the topic and continue if valid', async () => {
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.select_topic({ topicId: 'topic1' });
      expect(res).toEqual({ ok: true });
      expect(useMeetingSetupStore.getState().selectedTopic).toBe('topic1');
      expect(ctx.buildSelectedTopic).toHaveBeenCalledTimes(1);
      expect(ctx.selectTopic).toHaveBeenCalledTimes(1);
    });

    it('should return error if topicId is missing', async () => {
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.select_topic({});
      expect(res).toEqual({ ok: false, error: 'Missing topicId' });
      expect(useMeetingSetupStore.getState().selectedTopic).toBe('');
    });

    it('should return error if invalid topicId', async () => {
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.select_topic({ topicId: 'invalid' });
      expect(res).toEqual({ ok: false, error: 'Unknown topicId: invalid' });
      expect(useMeetingSetupStore.getState().selectedTopic).toBe('');
    });

    it('should require custom topic text before choosing customtopic', async () => {
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.select_topic({ topicId: 'customtopic' });
      expect(res).toEqual({
        ok: false,
        error: 'Set the custom topic text before choosing the custom topic.'
      });
    });
  });

  describe('go_to_topic_step', () => {
    it('should call the topic-step callback', async () => {
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.go_to_topic_step({});
      expect(res).toEqual({ ok: true });
      expect(ctx.goToTopicStep).toHaveBeenCalledTimes(1);
    });

    it('should call beginSetup from landing', async () => {
      ctx.meetingStep = 'landing';
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.go_to_topic_step({});
      expect(res).toEqual({ ok: true });
      expect(ctx.beginSetup).toHaveBeenCalledTimes(1);
      expect(ctx.goToTopicStep).not.toHaveBeenCalled();
    });
  });

  describe('begin_setup', () => {
    it('should open setup from landing', async () => {
      ctx.meetingStep = 'landing';
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.begin_setup({});
      expect(res).toEqual({ ok: true });
      expect(ctx.beginSetup).toHaveBeenCalledTimes(1);
    });
  });

  describe('highlight_character', () => {
    beforeEach(() => {
      ctx.meetingStep = 'characters';
    });

    it('should set hovered character if valid', async () => {
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.highlight_character({ characterId: 'food1' });
      expect(res).toEqual({ ok: true });
      expect(useMeetingSetupStore.getState().hoveredCharacter).toBe('food1');
    });

    it('should set hovered character to null if missing or empty', async () => {
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.highlight_character({});
      expect(res).toEqual({ ok: true });
      expect(useMeetingSetupStore.getState().hoveredCharacter).toBe(null);
    });

    it('should return error if invalid characterId', async () => {
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.highlight_character({ characterId: 'invalid' });
      expect(res).toEqual({ ok: false, error: 'Unknown characterId: invalid' });
      expect(useMeetingSetupStore.getState().hoveredCharacter).toBe(null);
    });
  });

  describe('select_character', () => {
    it('should select character if valid and under max limits', async () => {
      ctx.meetingStep = 'characters';
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.select_character({ characterId: 'food1' });
      expect(res).toEqual({ ok: true });
      expect(useMeetingSetupStore.getState().selectedCharacters).toContain('food1');
    });

    it('should return error if handleSelectCharacterId fails (max characters limit)', async () => {
      ctx.meetingStep = 'characters';
      useMeetingSetupStore.getState().setSelectedCharacters(['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7']);
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.select_character({ characterId: 'food2' });
      expect(res).toEqual({ ok: false, error: 'Maximum number of characters (6 plus the chair) already selected.' });
    });
  });
});
