import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import ModeSwitchButton from '@/museum/ModeSwitchButton';
import { APP_MODE_STORAGE_KEY, LAST_INSTALLATION_MODE_STORAGE_KEY } from '@/settings/councilSettings';
import '@testing-library/jest-dom';

describe('ModeSwitchButton', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('switches from museum to web mode on click', () => {
    localStorage.setItem(APP_MODE_STORAGE_KEY, 'museum');
    render(
      <MemoryRouter>
        <ModeSwitchButton />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('mode-switch-button'));
    expect(localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe('web');
  });

  it('switches from presenter to web mode on click', () => {
    localStorage.setItem(APP_MODE_STORAGE_KEY, 'presenter');
    render(
      <MemoryRouter>
        <ModeSwitchButton />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('mode-switch-button'));
    expect(localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe('web');
  });

  it('returns from web to museum when no installation mode has been chosen yet', () => {
    localStorage.setItem(APP_MODE_STORAGE_KEY, 'web');
    render(
      <MemoryRouter>
        <ModeSwitchButton />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('mode-switch-button'));
    expect(localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe('museum');
  });

  it('returns from web to the last installation mode staff selected', () => {
    localStorage.setItem(APP_MODE_STORAGE_KEY, 'web');
    localStorage.setItem(LAST_INSTALLATION_MODE_STORAGE_KEY, 'presenter');
    render(
      <MemoryRouter>
        <ModeSwitchButton />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('mode-switch-button'));
    expect(localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe('presenter');
  });

  it('round-trips presenter through web without losing it', () => {
    localStorage.setItem(APP_MODE_STORAGE_KEY, 'presenter');
    localStorage.setItem(LAST_INSTALLATION_MODE_STORAGE_KEY, 'presenter');
    render(
      <MemoryRouter>
        <ModeSwitchButton />
      </MemoryRouter>,
    );
    const button = screen.getByTestId('mode-switch-button');
    fireEvent.click(button);
    expect(localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe('web');
    fireEvent.click(button);
    expect(localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe('presenter');
  });

  it('shows red border preview on #staff', () => {
    render(
      <MemoryRouter initialEntries={['/#staff']}>
        <ModeSwitchButton />
      </MemoryRouter>,
    );
    const button = screen.getByTestId('mode-switch-button');
    expect(button).toHaveStyle({ border: '2px solid rgb(252, 165, 165)' });
    expect(button).toHaveStyle({ opacity: '1' });
  });

  it('stays invisible outside #staff', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <ModeSwitchButton />
      </MemoryRouter>,
    );
    const button = screen.getByTestId('mode-switch-button');
    expect(button).toHaveStyle({ opacity: '0' });
    expect(button.style.boxShadow).toBe('');
  });
});
