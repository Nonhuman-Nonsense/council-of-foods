import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import Contact from "@main/overlay/Contact";

vi.mock("@/utils", () => ({
  useMobile: () => false,
  dvh: "vh",
}));

describe("Contact", () => {
  it("renders credits and funding with external links", () => {
    render(<Contact />);

    const creditsParagraph = screen.getByText(/developed in collaboration with/).closest("p");
    expect(creditsParagraph).not.toBeNull();
    expect(
      creditsParagraph!.querySelector('a[href="https://nonhuman-nonsense.com"]'),
    ).toHaveTextContent("Nonhuman Nonsense");

    expect(
      screen.getByRole("link", { name: "Studio Other Spaces" }),
    ).toHaveAttribute("href", "https://studiootherspaces.net/");

    expect(
      screen.getByRole("link", { name: "The Hungry EcoCities project" }),
    ).toHaveAttribute("href", "https://starts.eu/hungryecocities/");

    expect(screen.getByRole("link", { name: "S+T+ARTS" })).toHaveAttribute(
      "href",
      "https://starts.eu/",
    );

    expect(
      screen.getByRole("link", {
        name: /Horizon Europe research and innovation programme under grant agreement 101069990/,
      }),
    ).toHaveAttribute("href", "https://cordis.europa.eu/project/id/101069990");
  });

  it("renders social and email links", () => {
    render(<Contact />);

    expect(screen.getByRole("link", { name: "@nonhuman_nonsense" })).toHaveAttribute(
      "href",
      "https://www.instagram.com/nonhuman_nonsense/",
    );
    expect(screen.getByRole("link", { name: "nonhuman-nonsense.com" })).toHaveAttribute(
      "href",
      "https://nonhuman-nonsense.com",
    );
    expect(screen.getByRole("link", { name: "hello@nonhuman-nonsense.com" })).toHaveAttribute(
      "href",
      "mailto:hello@nonhuman-nonsense.com",
    );
  });

  it("renders EU funding image alt text from i18n", () => {
    render(<Contact />);

    expect(
      screen.getByRole("img", { name: "Funded by the EU, as part of S+T+ARTS" }),
    ).toBeInTheDocument();
  });
});
