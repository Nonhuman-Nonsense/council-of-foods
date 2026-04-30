import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import FoodsCouncilScene from "@council/FoodsCouncilScene";

const mockFoodItem = vi.fn(() => <div data-testid="food-item" />);

vi.mock("@/utils", () => ({
  mapFoodIndex: vi.fn((total, index) => index),
}));

vi.mock("@council/FoodItem", () => ({
  default: (props: any) => {
    mockFoodItem(props);
    return <div data-testid="food-item" />;
  },
}));

describe("FoodsCouncilScene", () => {
  it("renders only non-panelist participants in the foods ring", () => {
    render(
      <FoodsCouncilScene
        participants={[
          { id: "banana", name: "Banana", description: "", prompt: "", voice: "alloy" },
          { id: "panelist0", name: "Sage", description: "", prompt: "", voice: "alloy" },
          { id: "tomato", name: "Tomato", description: "", prompt: "", voice: "alloy" },
        ]}
        currentSpeakerId="banana"
        councilState="playing"
        playingNowIndex={1}
        textMessages={[
          { type: "message", id: "m0", speaker: "banana", text: "Hi" },
          { type: "message", id: "m1", speaker: "tomato", text: "Hello" },
        ]}
        currentSnippetIndex={0}
        sentencesLength={4}
        isPaused={false}
      />
    );

    expect(screen.getAllByTestId("food-item")).toHaveLength(2);
    expect(mockFoodItem).toHaveBeenCalledTimes(2);
    expect(mockFoodItem).toHaveBeenCalledWith(
      expect.objectContaining({
        food: expect.objectContaining({ id: "banana" }),
        currentSpeakerId: "banana",
        isPaused: false,
      })
    );
    expect(mockFoodItem).toHaveBeenCalledWith(
      expect.objectContaining({
        food: expect.objectContaining({ id: "tomato" }),
        currentSpeakerId: "banana",
        isPaused: false,
      })
    );
  });
});
