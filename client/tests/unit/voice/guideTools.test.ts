import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGuideToolHandlers, GuideToolContext } from '../../../src/voice/guideTools';

describe('guideTools', () => {
  let ctx: GuideToolContext;

  beforeEach(() => {
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
      selectedTopic: '',
      setSelectedTopic: vi.fn(),
      customTopic: '',
      setCustomTopic: vi.fn(),
      selectedFoods: [],
      handleSelectFoodId: vi.fn().mockReturnValue(true),
      handleDeselectFoodId: vi.fn(),
      humans: [],
      setHumans: vi.fn(),
      numberOfHumans: 0,
      setNumberOfHumans: vi.fn(),
      setHoveredTopic: vi.fn(),
      setHoveredFood: vi.fn(),
      buildSelectedTopicFromUi: vi.fn(),
      confirmTopic: vi.fn(),
      startMeeting: vi.fn(),
      meetingStep: 'topic',
      voiceGuideLanguage: 'en',
      meetingFoodsLabels: { oneHuman: 'Human', twoHumansSuffix: ' Humans' }
    };
  });

  describe('highlight_topic', () => {
    it('should set hovered topic if valid', async () => {
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.highlight_topic({ topicId: 'topic1' });
      expect(res).toEqual({ ok: true });
      expect(ctx.setHoveredTopic).toHaveBeenCalledWith('topic1');
    });

    it('should set hovered topic to null if missing or empty', async () => {
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.highlight_topic({});
      expect(res).toEqual({ ok: true });
      expect(ctx.setHoveredTopic).toHaveBeenCalledWith(null);

      const res2 = await handlers.highlight_topic({ topicId: '' });
      expect(res2).toEqual({ ok: true });
      expect(ctx.setHoveredTopic).toHaveBeenCalledWith(null);
    });

    it('should return error if invalid topicId', async () => {
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.highlight_topic({ topicId: 'invalid' });
      expect(res).toEqual({ ok: false, error: 'Unknown topicId: invalid' });
      expect(ctx.setHoveredTopic).not.toHaveBeenCalled();
    });
  });

  describe('highlight_food', () => {
    it('should set hovered food if valid', async () => {
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.highlight_food({ foodId: 'food1' });
      expect(res).toEqual({ ok: true });
      expect(ctx.setHoveredFood).toHaveBeenCalledWith('food1');
    });

    it('should set hovered food to null if missing or empty', async () => {
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.highlight_food({});
      expect(res).toEqual({ ok: true });
      expect(ctx.setHoveredFood).toHaveBeenCalledWith(null);
    });

    it('should return error if invalid foodId', async () => {
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.highlight_food({ foodId: 'invalid' });
      expect(res).toEqual({ ok: false, error: 'Unknown foodId: invalid' });
      expect(ctx.setHoveredFood).not.toHaveBeenCalled();
    });
  });

  describe('select_food', () => {
    it('should select food if valid and under max limits', async () => {
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.select_food({ foodId: 'food1' });
      expect(res).toEqual({ ok: true });
      expect(ctx.handleSelectFoodId).toHaveBeenCalledWith('food1');
    });

    it('should return error if handleSelectFoodId fails (max foods limit)', async () => {
      vi.mocked(ctx.handleSelectFoodId).mockReturnValue(false);
      const handlers = createGuideToolHandlers(ctx);
      const res = await handlers.select_food({ foodId: 'food2' });
      expect(res).toEqual({ ok: false, error: 'Maximum number of characters (6 plus the chair) already selected.' });
      expect(ctx.handleSelectFoodId).toHaveBeenCalledWith('food2');
    });
  });
});
