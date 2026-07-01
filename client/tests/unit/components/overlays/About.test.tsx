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
  it("renders body copy and credit line with contact link", () => {
    render(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Welcome to the Council of Foods!/)).toBeInTheDocument();
    expect(screen.getByText(/a project by/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nonhuman Nonsense" })).toHaveAttribute(
      "href",
      "/#contact",
    );
  });
});
