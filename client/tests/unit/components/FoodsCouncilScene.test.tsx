import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import FoodsCouncilScene from "@council/FoodsCouncilScene";
import { MockFactory } from "../factories/MockFactory";

const mockFoodItem = vi.fn(() => <div data-testid="food-item" />);

const participantA = { id: "character-a", name: "Character A" };
const participantB = { id: "character-b", name: "Character B" };

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
          MockFactory.createCharacter({ id: participantA.id, name: participantA.name, description: "", prompt: "" }),
          MockFactory.createPanelist(0, { name: "Sage" }),
          MockFactory.createCharacter({ id: participantB.id, name: participantB.name, description: "", prompt: "" }),
        ]}
        currentSpeakerId={participantA.id}
        councilState="playing"
        playingNowIndex={1}
        textMessages={[
          { type: "message", id: "m0", speaker: participantA.id, text: "Hi" },
          { type: "message", id: "m1", speaker: participantB.id, text: "Hello" },
        ]}
        currentSnippetIndex={0}
        audioMessages={[
          {
            id: "m1",
            audio: {} as AudioBuffer,
            sentences: [
              { text: "One.", start: 0, end: 1 },
              { text: "Two.", start: 1, end: 2 },
              { text: "Three.", start: 2, end: 3 },
              { text: "Four.", start: 3, end: 4 },
            ],
          },
        ]}
        isPaused={false}
      />
    );

    expect(screen.getAllByTestId("food-item")).toHaveLength(2);
    expect(mockFoodItem).toHaveBeenCalledTimes(2);
    expect(mockFoodItem).toHaveBeenCalledWith(
      expect.objectContaining({
        food: expect.objectContaining({ id: participantA.id }),
        currentSpeakerId: participantA.id,
        isPaused: false,
      })
    );
    expect(mockFoodItem).toHaveBeenCalledWith(
      expect.objectContaining({
        food: expect.objectContaining({ id: participantB.id }),
        currentSpeakerId: participantA.id,
        isPaused: false,
      })
    );
  });
});
