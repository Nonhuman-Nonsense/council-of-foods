import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import MuseumSwitchButton from '@/museum/MuseumSwitchButton';
import { APP_MODE_STORAGE_KEY } from '@/settings/councilSettings';
import '@testing-library/jest-dom';

describe('MuseumSwitchButton', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('switches from museum to web mode on click', () => {
    localStorage.setItem(APP_MODE_STORAGE_KEY, 'museum');
    render(
      <MemoryRouter>
        <MuseumSwitchButton />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('museum-switch-button'));
    expect(localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe('web');
  });

  it('switches from web to museum mode on click', () => {
    localStorage.setItem(APP_MODE_STORAGE_KEY, 'web');
    render(
      <MemoryRouter>
        <MuseumSwitchButton />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('museum-switch-button'));
    expect(localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe('museum');
  });

  it('shows red border preview on #setup', () => {
    render(
      <MemoryRouter initialEntries={['/#setup']}>
        <MuseumSwitchButton />
      </MemoryRouter>,
    );
    const button = screen.getByTestId('museum-switch-button');
    expect(button).toHaveStyle({ border: '2px solid rgb(252, 165, 165)' });
    expect(button).toHaveStyle({ opacity: '1' });
  });

  it('stays invisible outside #setup', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <MuseumSwitchButton />
      </MemoryRouter>,
    );
    const button = screen.getByTestId('museum-switch-button');
    expect(button).toHaveStyle({ opacity: '0' });
    expect(button.style.boxShadow).toBe('');
  });
});
