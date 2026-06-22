import { describe, it, expect } from "vitest";
import {
  buildMetaAgentPrompt,
  buildMetaAgentStateSnapshot,
  type MetaAgentStateSnapshot,
} from "@/museum/metaAgent/metaAgentPrompt";

function makeSnapshot(overrides: Partial<MetaAgentStateSnapshot> = {}): MetaAgentStateSnapshot {
  return {
    councilState: "playing",
    topic: { id: "forests", title: "Forest Protection", description: "", prompt: "" },
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

describe("buildMetaAgentPrompt", () => {
  it("includes ptt note when push-to-talk mode is on", () => {
    const prompt = buildMetaAgentPrompt({ pushToTalkMode: true });
    expect(prompt).toContain("hold to talk");
  });

  it("omits ptt note when push-to-talk mode is off", () => {
    const prompt = buildMetaAgentPrompt({ pushToTalkMode: false });
    expect(prompt).not.toContain("hold to talk");
  });

  it("mentions resume_meeting and restart_meeting tools", () => {
    const prompt = buildMetaAgentPrompt({ pushToTalkMode: false });
    expect(prompt).toContain("resume_meeting");
    expect(prompt).toContain("restart_meeting");
  });
});

describe("buildMetaAgentStateSnapshot", () => {
  it("produces a (STATE SYNC: ...) string", () => {
    const snap = buildMetaAgentStateSnapshot(makeSnapshot());
    expect(snap).toMatch(/^\(STATE SYNC: \{/);
  });

  it("includes council state, topic, speaker, and visitor name", () => {
    const snap = buildMetaAgentStateSnapshot(makeSnapshot());
    const payload = JSON.parse(snap.replace(/^\(STATE SYNC: /, "").replace(/\)$/, ""));
    expect(payload.councilState).toBe("playing");
    expect(payload.topic.title).toBe("Forest Protection");
    expect(payload.currentSpeaker).toBe("Oak");
    expect(payload.visitorName).toBe("Alice");
    expect(payload.participants).toBe("Water, Oak");
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
