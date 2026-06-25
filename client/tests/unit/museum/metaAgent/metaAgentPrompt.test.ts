import { describe, it, expect } from "vitest";
import {
  buildMetaAgentActivationTurn,
  buildMetaAgentPrompt,
  buildMetaAgentStateSnapshot,
  getMetaAgentBundle,
  type MetaAgentPromptBundle,
  type MetaAgentStateSnapshot,
} from "@/museum/metaAgent/metaAgentPrompt";

const testBundle: MetaAgentPromptBundle = {
  chairIdentity: "You are Water, the chair and moderator of the Council of Foods.",
  chairVoice: "Your voice is diplomatic and clear.",
  projectDescription: "Council of Foods is a live political council where foods debate the food system.",
  councilVocabulary: {
    singular: "food",
    plural: "foods",
    councilName: "Council of Foods",
  },
  jobInstructions: [
    "Handle interruptions during a live council meeting.",
    "When the exchange feels complete, call continue_meeting.",
  ],
  toolDescriptions: {
    continue_meeting:
      "Return to the live council meeting when the visitor seems done with this interruption.",
    restart_meeting:
      "Restart the entire meeting from the beginning, returning to the setup screen.",
  },
  activationGreetingExample:
    "Excuse me — you've interrupted the council. You'll be invited to speak when it's your turn. Unless you'd like to start from the beginning?",
};

function makeSnapshot(overrides: Partial<MetaAgentStateSnapshot> = {}): MetaAgentStateSnapshot {
  return {
    councilState: "playing",
    topic: {
      id: "forests",
      title: "Forest Protection",
      description: "Ancient forests are under pressure from logging and climate change.",
      prompt: "",
    },
    participants: [
      { id: "water", name: "Water", description: "", prompt: "", voice: "" },
      { id: "oak", name: "Oak", description: "", prompt: "", voice: "" },
    ],
    currentSpeakerName: "Oak",
    humanName: "Alice",
    participationPhase: "off",
    ...overrides,
  };
}

describe("getMetaAgentBundle", () => {
  it("loads the foods meta-agent bundle for English", () => {
    const bundle = getMetaAgentBundle("en");
    expect(bundle.chairIdentity).toContain("Water");
    expect(bundle.councilVocabulary.councilName).toBe("Council of Foods");
    expect(bundle.jobInstructions.length).toBeGreaterThan(0);
  });
});

describe("buildMetaAgentPrompt", () => {
  it("includes chair identity, project, and council vocabulary", () => {
    const prompt = buildMetaAgentPrompt({ bundle: testBundle, pushToTalkMode: true });
    expect(prompt).toContain("You are Water");
    expect(prompt).toContain("Council of Foods");
    expect(prompt).toContain("foods debate");
  });

  it("includes ptt note when push-to-talk mode is on", () => {
    const prompt = buildMetaAgentPrompt({ bundle: testBundle, pushToTalkMode: true });
    expect(prompt).toContain("hold to talk");
  });

  it("omits ptt note when push-to-talk mode is off", () => {
    const prompt = buildMetaAgentPrompt({ bundle: testBundle, pushToTalkMode: false });
    expect(prompt).not.toContain("hold to talk");
  });

  it("mentions continue_meeting and restart_meeting tools", () => {
    const prompt = buildMetaAgentPrompt({ bundle: testBundle });
    expect(prompt).toContain("continue_meeting");
    expect(prompt).toContain("restart_meeting");
    expect(prompt).toContain(testBundle.toolDescriptions.continue_meeting);
  });

  it("instructs the agent to judge when to resume and call continue_meeting", () => {
    const prompt = buildMetaAgentPrompt({ bundle: testBundle });
    expect(prompt).toContain("You decide when the interruption is over");
    expect(prompt).toContain("call continue_meeting in that same turn");
    expect(prompt).toContain("Do not end a turn with only a spoken goodbye");
  });

  it("loads continue guidance from the shipped foods bundle", () => {
    const bundle = getMetaAgentBundle("en");
    const prompt = buildMetaAgentPrompt({ bundle });
    expect(bundle.jobInstructions.join(" ")).toContain("Err on resuming");
    expect(prompt).toContain(bundle.toolDescriptions.continue_meeting);
  });

  it("instructs staying quiet until STATE SYNC and acknowledging the interruption", () => {
    const prompt = buildMetaAgentPrompt({ bundle: testBundle });
    expect(prompt).toContain("Stay quiet until you receive (STATE SYNC:");
    expect(prompt).toContain("acknowledging the interruption");
    expect(prompt).toContain("Do not open with 'How can I help you?'");
  });

  it("includes an example interruption greeting with vary instruction", () => {
    const prompt = buildMetaAgentPrompt({ bundle: testBundle });
    expect(prompt).toContain("Example tone (vary the words each time");
    expect(prompt).toContain("Excuse me — you've interrupted the council");
    expect(prompt).toContain("do not repeat verbatim");
  });

  it("loads activationGreetingExample from the shipped foods bundle", () => {
    const bundle = getMetaAgentBundle("en");
    const prompt = buildMetaAgentPrompt({ bundle });
    expect(bundle.activationGreetingExample).toContain("interrupted");
    expect(prompt).toContain(bundle.activationGreetingExample);
  });

  it("frames the role as interruption handler, not a guide", () => {
    const prompt = buildMetaAgentPrompt({ bundle: testBundle });
    expect(prompt).toContain("not a kiosk helper");
    expect(prompt).toContain("address the interruption");
  });

  it("uses the shipped foods bundle without errors", () => {
    const prompt = buildMetaAgentPrompt({
      bundle: getMetaAgentBundle("en"),
      pushToTalkMode: true,
    });
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt.length).toBeLessThan(4000);
  });
});

describe("buildMetaAgentActivationTurn", () => {
  it("asks for an interruption greeting, not a generic welcome", () => {
    const turn = buildMetaAgentActivationTurn();
    expect(turn).toContain("interrupted");
    expect(turn).toContain("interruption greeting");
    expect(turn).toContain("STATE SYNC");
  });
});

describe("buildMetaAgentStateSnapshot", () => {
  it("produces a (STATE SYNC: ...) string", () => {
    const snap = buildMetaAgentStateSnapshot(makeSnapshot());
    expect(snap).toMatch(/^\(STATE SYNC: \{/);
  });

  it("includes topic description, council members, speaker, and visitor name", () => {
    const snap = buildMetaAgentStateSnapshot(makeSnapshot());
    const payload = JSON.parse(snap.replace(/^\(STATE SYNC: /, "").replace(/\)$/, ""));
    expect(payload.councilState).toBe("playing");
    expect(payload.topic.title).toBe("Forest Protection");
    expect(payload.topic.description).toContain("Ancient forests");
    expect(payload.councilMembers).toEqual(["Oak"]);
    expect(payload.currentSpeaker).toBe("Oak");
    expect(payload.visitorName).toBe("Alice");
  });

  it("excludes the chair from councilMembers", () => {
    const snap = buildMetaAgentStateSnapshot(makeSnapshot());
    const payload = JSON.parse(snap.replace(/^\(STATE SYNC: /, "").replace(/\)$/, ""));
    expect(payload.councilMembers).not.toContain("Water");
  });

  it("includes human panelists when present", () => {
    const snap = buildMetaAgentStateSnapshot(
      makeSnapshot({
        participants: [
          { id: "water", name: "Water", description: "", prompt: "", voice: "" },
          { id: "oak", name: "Oak", description: "", prompt: "", voice: "" },
          {
            id: "panelist0",
            name: "Dr. Lee",
            description: "Nutrition researcher",
            prompt: "",
            voice: "",
          },
        ],
      }),
    );
    const payload = JSON.parse(snap.replace(/^\(STATE SYNC: /, "").replace(/\)$/, ""));
    expect(payload.humanPanelists).toEqual([
      { name: "Dr. Lee", description: "Nutrition researcher" },
    ]);
  });

  it("handles null topic gracefully", () => {
    const snap = buildMetaAgentStateSnapshot(makeSnapshot({ topic: null }));
    const payload = JSON.parse(snap.replace(/^\(STATE SYNC: /, "").replace(/\)$/, ""));
    expect(payload.topic).toBeNull();
  });

  it("handles empty speaker and visitor name", () => {
    const snap = buildMetaAgentStateSnapshot(
      makeSnapshot({ currentSpeakerName: "", humanName: "" }),
    );
    const payload = JSON.parse(snap.replace(/^\(STATE SYNC: /, "").replace(/\)$/, ""));
    expect(payload.currentSpeaker).toBeNull();
    expect(payload.visitorName).toBeNull();
  });
});
