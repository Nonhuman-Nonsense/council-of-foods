import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAppMode, setAppMode, APP_MODE_STORAGE_KEY } from '@/museum/appMode';

describe('appMode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to web', () => {
    expect(getAppMode()).toBe('web');
  });

  it('persists museum mode in localStorage', () => {
    setAppMode('museum');
    expect(localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe('museum');
    expect(getAppMode()).toBe('museum');

    setAppMode('web');
    expect(localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe('web');
    expect(getAppMode()).toBe('web');
  });

  it('treats unknown stored values as web', () => {
    localStorage.setItem(APP_MODE_STORAGE_KEY, 'kiosk');
    expect(getAppMode()).toBe('web');
  });

  it('dispatches a mode change event', () => {
    const listener = vi.fn();
    window.addEventListener('council-app-mode-change', listener);
    setAppMode('museum');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toBe('museum');
    window.removeEventListener('council-app-mode-change', listener);
  });
});
