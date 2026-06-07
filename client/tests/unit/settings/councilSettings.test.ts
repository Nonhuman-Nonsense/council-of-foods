import { describe, it, expect, beforeEach } from 'vitest';
import { getPushToTalk, setPushToTalk } from '@/settings/councilSettings';

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
});
