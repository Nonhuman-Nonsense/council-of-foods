import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import MuseumModeEscapeHatch from '@/museum/MuseumModeEscapeHatch';
import { APP_MODE_STORAGE_KEY } from '@/settings/councilSettings';
import '@testing-library/jest-dom';

describe('MuseumModeEscapeHatch', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('switches from museum to web mode on click', () => {
    localStorage.setItem(APP_MODE_STORAGE_KEY, 'museum');
    render(
      <MemoryRouter>
        <MuseumModeEscapeHatch />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('museum-mode-escape'));
    expect(localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe('web');
  });

  it('switches from web to museum mode on click', () => {
    localStorage.setItem(APP_MODE_STORAGE_KEY, 'web');
    render(
      <MemoryRouter>
        <MuseumModeEscapeHatch />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('museum-mode-escape'));
    expect(localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe('museum');
  });

  it('shows red border preview on #setup', () => {
    render(
      <MemoryRouter initialEntries={['/#setup']}>
        <MuseumModeEscapeHatch />
      </MemoryRouter>,
    );
    const hatch = screen.getByTestId('museum-mode-escape');
    expect(hatch).toHaveStyle({ border: '2px solid rgb(252, 165, 165)' });
    expect(hatch).toHaveStyle({ opacity: '1' });
  });

  it('stays invisible outside #setup', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <MuseumModeEscapeHatch />
      </MemoryRouter>,
    );
    const hatch = screen.getByTestId('museum-mode-escape');
    expect(hatch).toHaveStyle({ opacity: '0' });
    expect(hatch.style.boxShadow).toBe('');
  });
});
