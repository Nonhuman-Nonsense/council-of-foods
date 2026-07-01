import { describe, it, expect, beforeEach } from "vitest";
import { useMeetingSetupStore } from "@newMeeting/meetingSetupStore";
import { CHAIR_ID } from "@/prompts/characterSetupBundles";

describe("useMeetingSetupStore.resetStore", () => {
  beforeEach(() => {
    useMeetingSetupStore.getState().resetStore();
  });

  it("restores default topic and character selection", () => {
    const store = useMeetingSetupStore.getState();
    store.setSelectedTopic("forestry");
    store.setCustomTopic("Custom issue");
    store.setSelectedCharacters([CHAIR_ID, "food-a", "food-b"]);
    store.setVisitorName("Alex");
    store.setNumberOfHumans(1);

    store.resetStore();

    const reset = useMeetingSetupStore.getState();
    expect(reset.selectedTopic).toBe("");
    expect(reset.customTopic).toBe("");
    expect(reset.selectedCharacters).toEqual([CHAIR_ID]);
    expect(reset.visitorName).toBe("");
    expect(reset.numberOfHumans).toBe(0);
    expect(reset.hoveredCharacter).toBeNull();
  });
});
