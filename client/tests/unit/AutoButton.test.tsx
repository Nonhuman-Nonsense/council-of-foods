import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import AutoButton from "@/AutoButton";

function setupMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

describe("AutoButton", () => {
  beforeEach(() => {
    setupMatchMedia();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs action once after timeout when no guard", async () => {
    vi.useFakeTimers();
    const action = vi.fn();

    render(
      <AutoButton timeout={5} action={action}>
        Go
      </AutoButton>,
    );

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    expect(action).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    expect(action).toHaveBeenCalledTimes(1);
  });

  it("runs action on click when no guard", () => {
    const action = vi.fn();

    render(
      <AutoButton timeout={30} action={action}>
        Go
      </AutoButton>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Go" }));

    expect(action).toHaveBeenCalledTimes(1);
  });

  it("runs action when guard returns true without showing retry message", async () => {
    vi.useFakeTimers();
    const action = vi.fn();
    const guardAction = vi.fn().mockResolvedValue(true);

    render(
      <AutoButton
        timeout={5}
        action={action}
        guardAction={guardAction}
        guardRetryMessage="Server unavailable for restart, retrying…"
      >
        Go
      </AutoButton>,
    );

    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });

    expect(guardAction).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("Server unavailable for restart, retrying…"),
    ).not.toBeVisible();
  });

  it("retries countdown when guard returns false", async () => {
    vi.useFakeTimers();
    const action = vi.fn();
    const guardAction = vi.fn().mockResolvedValue(false);

    render(
      <AutoButton
        timeout={5}
        action={action}
        guardAction={guardAction}
        guardRetryMessage="Server unavailable for restart, retrying…"
      >
        Go
      </AutoButton>,
    );

    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });

    expect(guardAction).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
    expect(
      screen.getByText("Server unavailable for restart, retrying…"),
    ).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });

    expect(guardAction).toHaveBeenCalledTimes(2);
    expect(action).not.toHaveBeenCalled();
  });

  it("runs action on click without running guard", () => {
    const action = vi.fn();
    const guardAction = vi.fn().mockResolvedValue(true);

    render(
      <AutoButton timeout={30} action={action} guardAction={guardAction}>
        Go
      </AutoButton>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Go" }));

    expect(action).toHaveBeenCalledTimes(1);
    expect(guardAction).not.toHaveBeenCalled();
  });

  it("keeps button label while guard is in flight", async () => {
    vi.useFakeTimers();
    let resolveGuard: (value: boolean) => void = () => undefined;
    const guardAction = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveGuard = resolve;
        }),
    );

    render(
      <AutoButton timeout={5} action={vi.fn()} guardAction={guardAction}>
        Go
      </AutoButton>,
    );

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    expect(screen.getByRole("button", { name: "Go" })).toBeDisabled();

    await act(async () => {
      resolveGuard(false);
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "Go" })).toBeEnabled();
  });

  it("does not run action after unmount during guard", async () => {
    vi.useFakeTimers();
    const action = vi.fn();
    const guardAction = vi.fn(
      () =>
        new Promise<boolean>(() => {
          /* never resolves */
        }),
    );

    const { unmount } = render(
      <AutoButton timeout={5} action={action} guardAction={guardAction}>
        Go
      </AutoButton>,
    );

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    unmount();

    await act(async () => {
      await Promise.resolve();
    });

    expect(action).not.toHaveBeenCalled();
  });
});
