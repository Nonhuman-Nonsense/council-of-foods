import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import Name from "@council/overlays/Name";
import type { Character } from "@shared/ModelTypes";

const mockUseMobile = vi.fn();
vi.mock("@/utils", () => ({
  useMobile: () => mockUseMobile(),
  capitalizeFirstLetter: (str: string) => str.charAt(0).toUpperCase() + str.slice(1),
}));

describe("Name Overlay", () => {
  const mockOnContinueForward = vi.fn();
  const mockParticipants: Character[] = [
    { id: "banana", name: "Banana", voice: "alloy", description: "", prompt: "" },
    { id: "apple", name: "Apple", voice: "alloy", description: "", prompt: "" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMobile.mockReturnValue(false);
  });

  it.each([
    { mobile: false, focused: true },
    { mobile: true, focused: false },
  ])("auto-focuses the input on desktop but not on mobile (mobile=$mobile)", ({ mobile, focused }) => {
    mockUseMobile.mockReturnValue(mobile);
    render(<Name participants={mockParticipants} onContinueForward={mockOnContinueForward} />);

    const input = screen.getByPlaceholderText("your name");
    if (focused) {
      expect(input).toHaveFocus();
    } else {
      expect(input).not.toHaveFocus();
    }
  });

  it("validates empty input", () => {
    render(<Name participants={mockParticipants} onContinueForward={mockOnContinueForward} />);

    expect(screen.getByText("SAY SOMETHING")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("continue"));

    expect(screen.getByText("enter your name to proceed")).toBeVisible();
    expect(mockOnContinueForward).not.toHaveBeenCalled();
  });

  it("validates duplicate name", () => {
    render(<Name participants={mockParticipants} onContinueForward={mockOnContinueForward} />);

    fireEvent.change(screen.getByPlaceholderText("your name"), { target: { value: "Banana" } });
    fireEvent.click(screen.getByLabelText("continue"));

    expect(screen.getByText("name must be unique in the council")).toBeVisible();
    expect(mockOnContinueForward).not.toHaveBeenCalled();
  });

  it("submits valid name", () => {
    render(<Name participants={mockParticipants} onContinueForward={mockOnContinueForward} />);

    fireEvent.change(screen.getByPlaceholderText("your name"), { target: { value: "Cherry" } });
    fireEvent.click(screen.getByLabelText("continue"));

    expect(mockOnContinueForward).toHaveBeenCalledWith({ humanName: "Cherry" });
  });

  it("submits on Enter key", () => {
    render(<Name participants={mockParticipants} onContinueForward={mockOnContinueForward} />);

    const input = screen.getByPlaceholderText("your name");
    fireEvent.change(input, { target: { value: "Date" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", charCode: 13 });

    expect(mockOnContinueForward).toHaveBeenCalledWith({ humanName: "Date" });
  });

  it("capitalizes first letter", () => {
    render(<Name participants={mockParticipants} onContinueForward={mockOnContinueForward} />);

    const input = screen.getByPlaceholderText("your name");
    fireEvent.change(input, { target: { value: "elderberry" } });

    expect(input).toHaveValue("Elderberry");
  });
});
