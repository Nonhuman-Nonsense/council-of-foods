import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getPushToTalk, setPushToTalk, PUSH_TO_TALK_CHANGE_EVENT } from '@/settings/councilSettings';

describe('councilSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults push to talk to false', () => {
    expect(getPushToTalk()).toBe(false);
  });

  it('persists push to talk in localStorage', () => {
    setPushToTalk(true);
    expect(localStorage.getItem('councilPushToTalk')).toBe('true');
    expect(getPushToTalk()).toBe(true);

    setPushToTalk(false);
    expect(localStorage.getItem('councilPushToTalk')).toBe('false');
    expect(getPushToTalk()).toBe(false);
  });

  it('dispatches a change event when push to talk is updated', () => {
    const handler = vi.fn();
    window.addEventListener(PUSH_TO_TALK_CHANGE_EVENT, handler);

    setPushToTalk(true);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ detail: true }),
    );

    window.removeEventListener(PUSH_TO_TALK_CHANGE_EVENT, handler);
  });
});
