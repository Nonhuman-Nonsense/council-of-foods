import type { Character, Topic } from "@shared/ModelTypes";
import type { CouncilState } from "@council/hooks/useCouncilMachine";
import type { ParticipationPhase } from "@council/humanInput/participationPhase";

export type MetaAgentStateSnapshot = {
  councilState: CouncilState;
  topic: Topic | null;
  participants: Character[];
  currentSpeakerName: string;
  humanName: string;
  participationPhase: ParticipationPhase;
};

/**
 * Builds the system prompt for the meta-agent.
 *
 * Keep it short — long prompts cause provider errors. The agent learns current
 * meeting state from the snapshot injected at activate time, not from the prompt.
 */
export function buildMetaAgentPrompt(params: {
  pushToTalkMode: boolean;
}): string {
  const pttNote = params.pushToTalkMode
    ? "The visitor uses a physical button: hold to talk, release to send."
    : "";

  return `You are the host and chair of a live council meeting at a museum installation. \
The council is a group of nature beings (animals, plants, rivers) discussing an environmental topic. \
Your role during the meeting is to assist the visitor — answer questions about what is happening, \
help them navigate the experience, and act on their requests.

Be concise. Visitors are standing at a kiosk; speak in short, clear sentences. \
Do not reference on-screen UI or buttons by name. ${pttNote}

When the visitor is done, call resume_meeting to continue the council. \
If they want to start over, call restart_meeting. \
After calling resume_meeting or restart_meeting, do not speak — the session ends immediately.

When the visitor wants to speak to the council directly (raise a question or be a panelist), \
tell them they will be invited by the chair when it is their turn — the button will guide them.

When you receive a meta_agent_activate STATE SYNC, speak first — the visitor interrupted the \
meeting but may not say anything yet. Briefly acknowledge the interruption, explain they will \
be invited to speak when it is their turn, and mention they can start over if they prefer. \
Example tone: "Excuse me — you've interrupted the council. You'll be invited to speak when \
it's your turn. Unless you'd like to start from the beginning?" Keep it to 2–3 short sentences, \
then wait for the visitor. Use a different wording than the example above each time.

You will receive the current meeting state as a (STATE SYNC: ...) message when the visitor \
first activates you. Use that context to answer questions about what is happening.`;
}

/**
 * Synthetic user turn sent after STATE SYNC to trigger the activation greeting.
 * Mirrors the voice-guide opening-greeting pattern (user item + response.create).
 */
export function buildMetaAgentActivationTurn(): string {
  return (
    "The visitor just activated you and interrupted the meeting. " +
    "Give your activation greeting now, using the STATE SYNC context above."
  );
}

/**
 * One-shot snapshot injected into the conversation when the visitor first
 * presses the button (standby → active). Gives the agent enough context to
 * answer "what's happening?" without needing a live data feed.
 */
export function buildMetaAgentStateSnapshot(snapshot: MetaAgentStateSnapshot): string {
  const speakerList = snapshot.participants.map((p) => p.name).join(", ");
  const payload = {
    source: "system",
    type: "meta_agent_activate",
    councilState: snapshot.councilState,
    topic: snapshot.topic ? { id: snapshot.topic.id, title: snapshot.topic.title } : null,
    participants: speakerList || null,
    currentSpeaker: snapshot.currentSpeakerName || null,
    visitorName: snapshot.humanName || null,
    participationPhase: snapshot.participationPhase,
  };
  return `(STATE SYNC: ${JSON.stringify(payload)})`;
}
