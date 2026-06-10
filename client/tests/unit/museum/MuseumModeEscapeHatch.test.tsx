import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MuseumModeEscapeHatch from '@/museum/MuseumModeEscapeHatch';
import { APP_MODE_STORAGE_KEY } from '@/museum/appMode';
import '@testing-library/jest-dom';

describe('MuseumModeEscapeHatch', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(APP_MODE_STORAGE_KEY, 'museum');
  });

  it('switches to web mode on click', () => {
    render(<MuseumModeEscapeHatch />);
    fireEvent.click(screen.getByTestId('museum-mode-escape'));
    expect(localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe('web');
  });
});
