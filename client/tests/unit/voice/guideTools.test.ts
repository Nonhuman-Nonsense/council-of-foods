import { createGuideToolHandlers, GuideToolContext } from '../../../src/voice/guideTools';
import { useMeetingSetupStore } from '../../../src/stores/useMeetingSetupStore';

describe('guideTools', () => {
  let ctx: GuideToolContext;

  beforeEach(() => {
    useMeetingSetupStore.getState().resetStore();
    ctx = {
      topics: [
        { id: 'topic1', title: 'Topic One', description: 'Desc One' }
      ],
      foods: [
        { id: 'food1', name: 'Food One', description: 'Desc One' },
        { id: 'food2', name: 'Food Two', description: 'Desc Two' },
        { id: 'addhuman', name: 'Add Human', description: 'Add' },
        { id: 'panelist0', name: 'Alice', description: 'Human' }
      ],
      goToTopicStep: vi.fn(),
      buildSelectedTopic: vi.fn(),
      selectTopic: vi.fn(),
      startMeeting: vi.fn(),
      meetingStep: 'topic',
      voiceGuideLanguage: 'en',
      meetingFoodsLabels: { oneHuman: 'Human', twoHumansSuffix: ' Humans' }
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
  });

  describe('highlight_food', () => {
    it('should set hovered food if valid', async () => {
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.highlight_food({ foodId: 'food1' });
      expect(res).toEqual({ ok: true });
      expect(useMeetingSetupStore.getState().hoveredFood).toBe('food1');
    });

    it('should set hovered food to null if missing or empty', async () => {
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.highlight_food({});
      expect(res).toEqual({ ok: true });
      expect(useMeetingSetupStore.getState().hoveredFood).toBe(null);
    });

    it('should return error if invalid foodId', async () => {
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.highlight_food({ foodId: 'invalid' });
      expect(res).toEqual({ ok: false, error: 'Unknown foodId: invalid' });
      expect(useMeetingSetupStore.getState().hoveredFood).toBe(null);
    });
  });

  describe('select_food', () => {
    it('should select food if valid and under max limits', async () => {
      ctx.meetingStep = 'foods';
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.select_food({ foodId: 'food1' });
      expect(res).toEqual({ ok: true });
      expect(useMeetingSetupStore.getState().selectedFoods).toContain('food1');
    });

    it('should return error if handleSelectFoodId fails (max foods limit)', async () => {
      ctx.meetingStep = 'foods';
      // Set 7 foods to reach limit
      useMeetingSetupStore.getState().setSelectedFoods(['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7']);
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.select_food({ foodId: 'food2' });
      expect(res).toEqual({ ok: false, error: 'Maximum number of characters (6 plus the chair) already selected.' });
    });
  });
});
