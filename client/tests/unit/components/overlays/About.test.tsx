import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "@testing-library/jest-dom";
import About from "@main/overlay/About";

vi.mock("@/utils", () => ({
  useMobile: () => false,
  usePortrait: () => false,
}));

describe("About", () => {
  it("renders the translated body copy and a credit line with a working contact link", () => {
    const { container } = render(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    );

    // The body is themed marketing copy that's expected to vary per deployment (see
    // translation_en.json's "about.body") — assert it renders with real content, not its
    // exact prose, so an intentional copy edit doesn't fail this test (see TESTING.md:
    // never assert on content that changes independently of behavior).
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(paragraphs[0].textContent).toBeTruthy();
    expect(paragraphs[0].textContent!.length).toBeGreaterThan(50);

    // The credit line is stable boilerplate ("who made this"), not themed copy, so it's
    // safe to assert directly.
    expect(screen.getByText(/a project by/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nonhuman Nonsense" })).toHaveAttribute(
      "href",
      "/#contact",
    );
  });
});
