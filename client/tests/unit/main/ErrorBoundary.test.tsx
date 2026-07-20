import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBoundary from "@main/ErrorBoundary";
import { useErrorStore } from "@main/overlay/errorStore";

function Bomb(): never {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    useErrorStore.getState().resetForTests();
  });

  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <div>fine</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("fine")).toBeInTheDocument();
    expect(useErrorStore.getState().unrecoverableError).toBeNull();
  });

  it("routes a render-phase throw into unrecoverableError instead of propagating", () => {
    // React logs the caught error to console; suppress that expected noise for this test.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    consoleError.mockRestore();

    expect(useErrorStore.getState().unrecoverableError).toMatchObject({
      message: "boom",
      source: "react-error-boundary",
    });
  });
});
