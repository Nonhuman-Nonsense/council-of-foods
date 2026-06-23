import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  APP_MODE_CHANGE_EVENT,
  APP_MODE_STORAGE_KEY,
  PUSH_TO_TALK_CHANGE_EVENT,
  PUSH_TO_TALK_STORAGE_KEY,
  getAppMode,
  getPushToTalk,
  setAppMode,
  setPushToTalk,
} from '@/settings/councilSettings';

describe('councilSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('app mode', () => {
    it('defaults to web', () => {
      expect(getAppMode()).toBe('web');
    });

    it('persists app mode in localStorage', () => {
      setAppMode('museum');
      expect(localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe('museum');
      expect(getAppMode()).toBe('museum');

      setAppMode('web');
      expect(localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe('web');
      expect(getAppMode()).toBe('web');
    });

    it('falls back to web when storage is unavailable', () => {
      const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });

      expect(getAppMode()).toBe('web');
      getItem.mockRestore();
    });

    it('dispatches a change event when app mode is updated', () => {
      const handler = vi.fn();
      window.addEventListener(APP_MODE_CHANGE_EVENT, handler);

      setAppMode('museum');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ detail: 'museum' }),
      );

      window.removeEventListener(APP_MODE_CHANGE_EVENT, handler);
    });
  });

  describe('push to talk', () => {
    it('defaults push to talk to false', () => {
      expect(getPushToTalk()).toBe(false);
    });

    it('persists push to talk in localStorage', () => {
      setPushToTalk(true);
      expect(localStorage.getItem(PUSH_TO_TALK_STORAGE_KEY)).toBe('true');
      expect(getPushToTalk()).toBe(true);

      setPushToTalk(false);
      expect(localStorage.getItem(PUSH_TO_TALK_STORAGE_KEY)).toBe('false');
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
});
