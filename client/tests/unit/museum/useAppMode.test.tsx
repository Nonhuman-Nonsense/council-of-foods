import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { useAppMode } from '@/museum/useAppMode';
import { APP_MODE_STORAGE_KEY, setAppMode } from '@/museum/appMode';

function ModeProbe() {
  const { mode, isMuseumMode, setAppMode: updateMode } = useAppMode();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="museum">{String(isMuseumMode)}</span>
      <button type="button" onClick={() => updateMode('web')}>to-web</button>
    </div>
  );
}

describe('useAppMode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('syncs mode across hook instances via custom event', async () => {
    render(
      <>
        <ModeProbe />
        <ModeProbe />
      </>
    );

    const modes = screen.getAllByTestId('mode');
    expect(modes[0]).toHaveTextContent('web');
    expect(modes[1]).toHaveTextContent('web');

    act(() => {
      setAppMode('museum');
    });

    await waitFor(() => {
      expect(modes[0]).toHaveTextContent('museum');
      expect(modes[1]).toHaveTextContent('museum');
    });
    expect(screen.getAllByTestId('museum')[0]).toHaveTextContent('true');
  });

  it('updates mode when setAppMode is called from a hook', () => {
    localStorage.setItem(APP_MODE_STORAGE_KEY, 'museum');
    render(<ModeProbe />);

    expect(screen.getByTestId('mode')).toHaveTextContent('museum');
    fireEvent.click(screen.getByRole('button', { name: 'to-web' }));
    expect(screen.getByTestId('mode')).toHaveTextContent('web');
    expect(localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe('web');
  });
});
