import { describe, it, expect } from "vitest";
import {
  buildExtensionAgentPrompt,
  buildExtensionStateSnapshot,
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
    "When the exchange feels complete, call resume_meeting.",
  ],
  toolDescriptions: {
    resume_meeting:
      "Return to the live council meeting when the visitor seems done with this interruption.",
    restart_meeting:
      "Restart the entire meeting from the beginning, returning to the setup screen.",
  },
  activationGreetingExample:
    "Excuse me — you've interrupted the council. You'll be invited to speak when it's your turn. Unless you'd like to start from the beginning?",
  extensionJobInstructions: [
    "Explain the meeting is getting long and ask extend or conclude.",
    "Call extend_meeting or conclude_meeting when the choice is clear.",
  ],
  extensionToolDescriptions: {
    extend_meeting: "Continue the council meeting for longer.",
    conclude_meeting: "End the meeting and move to the summary.",
  },
  extensionActivationGreetingExample:
    "We've been at this a while — extend a bit, or bring it to a conclusion?",
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

/**
 * These assert that bundle values reach the prompt, never how the prompt's own
 * copy is worded (TESTING.md): a wording assertion fails on every harmless
 * reword and still passes when the model ignores the instruction entirely.
 */
describe("buildMetaAgentPrompt", () => {
  it("includes chair identity, project, and council vocabulary", () => {
    const prompt = buildMetaAgentPrompt({ bundle: testBundle });
    expect(prompt).toContain("You are Water");
    expect(prompt).toContain("Council of Foods");
    expect(prompt).toContain("foods debate");
  });

  it("mentions resume_meeting and restart_meeting tools", () => {
    const prompt = buildMetaAgentPrompt({ bundle: testBundle });
    expect(prompt).toContain("resume_meeting");
    expect(prompt).toContain("restart_meeting");
    expect(prompt).toContain(testBundle.toolDescriptions.resume_meeting);
  });

  it("carries the shipped bundle's tool descriptions into the prompt", () => {
    const bundle = getMetaAgentBundle("en");
    const prompt = buildMetaAgentPrompt({ bundle });
    expect(prompt).toContain(bundle.toolDescriptions.resume_meeting);
  });

  it("carries the shipped bundle's greeting example into the prompt", () => {
    const bundle = getMetaAgentBundle("en");
    const prompt = buildMetaAgentPrompt({ bundle });
    expect(prompt).toContain(bundle.activationGreetingExample);
  });

  it("uses the shipped foods bundle without errors", () => {
    const prompt = buildMetaAgentPrompt({
      bundle: getMetaAgentBundle("en"),
    });
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt.length).toBeLessThan(4000);
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

describe("buildExtensionAgentPrompt", () => {
  it("includes extend_meeting and conclude_meeting tools", () => {
    const prompt = buildExtensionAgentPrompt({ bundle: testBundle });
    expect(prompt).toContain("extend_meeting");
    expect(prompt).toContain("conclude_meeting");
    expect(prompt).toContain(testBundle.extensionToolDescriptions.extend_meeting);
  });

  it("includes extension greeting example", () => {
    const prompt = buildExtensionAgentPrompt({ bundle: testBundle });
    expect(prompt).toContain(testBundle.extensionActivationGreetingExample);
  });

  it("loads extension copy from the shipped foods bundle", () => {
    const bundle = getMetaAgentBundle("en");
    const prompt = buildExtensionAgentPrompt({ bundle });
    expect(bundle.extensionJobInstructions.length).toBeGreaterThan(0);
    expect(prompt).toContain(bundle.extensionToolDescriptions.conclude_meeting);
  });
});

describe("buildExtensionStateSnapshot", () => {
  it("marks type meta_agent_extension and councilState query_extension", () => {
    const snap = buildExtensionStateSnapshot(makeSnapshot());
    const payload = JSON.parse(snap.replace(/^\(STATE SYNC: /, "").replace(/\)$/, ""));
    expect(payload.type).toBe("meta_agent_extension");
    expect(payload.councilState).toBe("query_extension");
  });
});
