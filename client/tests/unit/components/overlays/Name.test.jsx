import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import Name from "@council/overlays/Name";

const mockUseMobile = vi.fn();
vi.mock("@/utils", () => ({
  useMobile: () => mockUseMobile(),
  capitalizeFirstLetter: (str) => str.charAt(0).toUpperCase() + str.slice(1),
}));

describe("Name Overlay", () => {
  const mockOnContinueForward = vi.fn();
  const mockParticipants = [{ name: "Banana" }, { name: "Apple" }];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMobile.mockReturnValue(false);
  });

  it("renders correctly", () => {
    render(<Name participants={mockParticipants} onContinueForward={mockOnContinueForward} />);

    expect(screen.getByText("SAY SOMETHING")).toBeInTheDocument();
    const input = screen.getByPlaceholderText("your name");
    expect(input).toHaveFocus();
  });

  it("does not auto-focus on mobile", () => {
    mockUseMobile.mockReturnValue(true);
    render(<Name participants={mockParticipants} onContinueForward={mockOnContinueForward} />);

    expect(screen.getByPlaceholderText("your name")).not.toHaveFocus();
  });

  it("validates empty input", () => {
    render(<Name participants={mockParticipants} onContinueForward={mockOnContinueForward} />);

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
