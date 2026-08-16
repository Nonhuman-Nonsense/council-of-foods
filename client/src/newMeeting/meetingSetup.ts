import type { Character, Topic } from "@shared/ModelTypes";
import { injectRandomAgendaPoint } from "@shared/agendaPointInjection";
import { buildMeetingSystemPrompt, VISITOR_INPUT_PLACEHOLDER } from "@shared/topicPrompt";
import { toTitleCase } from "@/utils";
import type { TopicsData } from "@main/topicsBundle";
import { CHAIR_ID, getCharacterSetupBundle } from "./CharacterSetup";

export type MeetingCharactersI18n = {
  formatHumanCount: (count: number) => string;
};

export type MeetingSetupPhase = "landing" | "topic" | "characters";

function isPanelistId(id: string): boolean {
  return id.startsWith("panelist");
}

/**
 * In museum mode, place human panelist(s) near the middle of the lineup.
 * When the food count is odd, lean toward the later side (more foods before than after).
 */
export function orderSelectedCharactersForMuseum(selectedCharacters: string[]): string[] {
  const panelists = selectedCharacters.filter(isPanelistId);
  const nonPanelists = selectedCharacters.filter((id) => !isPanelistId(id));

  if (panelists.length === 0 || nonPanelists.length === 0) {
    return selectedCharacters;
  }

  const chair = nonPanelists[0];
  const foods = nonPanelists.slice(1);

  if (foods.length === 0) {
    return [chair, ...panelists];
  }

  const insertAt = Math.ceil(foods.length / 2);
  return [chair, ...foods.slice(0, insertAt), ...panelists, ...foods.slice(insertAt)];
}

/**
 * The council as it stands after a selection click. Carried on every character
 * event because reactions are debounced: a burst of picks collapses into a
 * single event, so the roster — not just the last name clicked — is what keeps
 * the agent's picture accurate. `selectedNames` excludes the chair and any
 * human panelists; the chair is passed separately so it can be described to
 * the agent as itself.
 */
export type CouncilRoster = {
  selectedNames: string[];
  chairName: string;
  /**
   * Whether another member (food or human) could still be added. Reflects the
   * total selection, not `selectedNames.length` — a council filled with human
   * panelists is just as full as one filled with foods, and `selectedNames`
   * excludes panelists.
   */
  isFull: boolean;
  /**
   * Named human panelists already in the council. Only populated by the
   * human-panelist events below — omitting it for character events keeps
   * their existing (minor, unreported) omission of panelists from the roster
   * line unchanged, rather than widening every character-event call site for
   * a cosmetic gap. It's load-bearing for human events specifically: without
   * it, a message can say "the visitor just described a panelist" and "the
   * council is currently just yourself, the moderator" in the same breath —
   * a direct contradiction that led the agent to re-add a panelist that was
   * already on screen (see the human_details_confirmed case below).
   */
  panelistNames?: string[];
};

/**
 * A human panelist's details as the visitor is entering them. `isComplete`
 * mirrors the per-panelist readiness check the UI itself uses (name required
 * always, description required outside museum mode), so the agent's picture
 * of "still needs X" matches what's actually blocking the Start button.
 */
export type HumanDetails = {
  humanName: string;
  humanDescription: string;
  isComplete: boolean;
};

export type MeetingSetupUserEvent =
  // "Let's go" on the welcome screen. The agent can reach the same step itself
  // by calling begin_setup, but a visitor who clicks past the welcome — which
  // is the only way through it with the microphone off — changes the step with
  // no other signal the agent could notice.
  | { type: "setup_started" }
  | {
      type: "topic_previewed";
      topicId: string;
      topicTitle: string;
    }
  | {
      type: "topic_committed";
      topicId: string;
      topicTitle: string;
    }
  | ({ type: "character_selected" } & CouncilRoster)
  | ({ type: "character_deselected" } & CouncilRoster)
  | ({ type: "characters_randomized" } & CouncilRoster)
  // A panelist joined the council: a brand-new slot (blank name) or an
  // existing one toggled back in (named). The details tell them apart.
  | ({ type: "human_selected" } & CouncilRoster & HumanDetails)
  // Fired while typing (debounced) — a weak, easily-superseded signal.
  | ({ type: "human_details_typed" } & CouncilRoster & HumanDetails)
  // Fired on deliberately leaving the field — a stronger "I'm done" signal,
  // reacted to sooner.
  | ({ type: "human_details_confirmed" } & CouncilRoster & HumanDetails)
  // Taken out of the council; the slot and details persist, so this is a
  // deselection rather than a delete.
  | ({ type: "human_deselected"; deselectedName: string } & CouncilRoster);

/**
 * What changed since the agent was last told about the council. Reactions are
 * debounced, so one message may cover several clicks; naming only the last one
 * would leave the agent commenting on "meat" when the visitor picked bean and
 * meat together.
 */
export type CouncilChanges = {
  added: string[];
  removed: string[];
};

/**
 * The council the visitor picked: selected ids resolved to names, without the
 * chair (always present, and the agent itself) or human panelists.
 */
export function selectedFoodNames(
  selectedIds: readonly string[],
  characters: ReadonlyArray<{ id: string; name: string }>,
): string[] {
  return selectedIds
    .filter((id) => id !== CHAIR_ID && !id.startsWith("panelist"))
    .map((id) => characters.find((character) => character.id === id)?.name)
    .filter((name): name is string => Boolean(name));
}

/** Diffs the council against what the agent was last told, in click order. */
export function diffCouncil(previousNames: string[], currentNames: string[]): CouncilChanges {
  return {
    added: currentNames.filter((name) => !previousNames.includes(name)),
    removed: previousNames.filter((name) => !currentNames.includes(name)),
  };
}

/** Joins names as a spoken list: "bean", "bean and meat", "bean, rice and meat". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Reaction delay per event kind, in ms. */
const STEP_CHANGE_REACTION_DELAY_MS = 0;
const TOPIC_PREVIEW_REACTION_DELAY_MS = 300;
const CHARACTER_REACTION_DELAY_MS = 1000;
const HUMAN_TYPING_REACTION_DELAY_MS = 5000;

/**
 * How long to wait after an action before reacting.
 * - Moving to another step takes the whole screen with it and cannot be
 *   repeated or taken back, so there is nothing to coalesce: react at once.
 * - Previewing a topic can be redone by clicking the next one, so it gets a
 *   short window to settle.
 * - Character picks come in bursts — up to six foods — so they get a window
 *   to coalesce into one reaction.
 * - Typing a panelist's details is the weakest signal: a long pause could
 *   just be the visitor thinking, so it gets the longest window.
 * - Leaving the field (blur) is a deliberate "I'm done" signal and reacts
 *   promptly rather than waiting out whatever's left of the typing window.
 */
export function getMeetingSetupReactionDelayMs(event: MeetingSetupUserEvent): number {
  if (event.type === "setup_started" || event.type === "topic_committed") {
    return STEP_CHANGE_REACTION_DELAY_MS;
  }
  if (event.type === "topic_previewed") {
    return TOPIC_PREVIEW_REACTION_DELAY_MS;
  }
  if (event.type === "human_details_typed") {
    return HUMAN_TYPING_REACTION_DELAY_MS;
  }
  return CHARACTER_REACTION_DELAY_MS;
}

/**
 * These turns are injected by a barge-in that cuts the agent off mid-speech
 * and truncates its transcript at the cut — so the conversation the model sees
 * ends on an unfinished sentence. Left to itself it tends to simply complete
 * that sentence rather than react to what the visitor just did.
 */
const CUT_OFF_NOTE =
  "If your previous sentence was cut off, do not finish it — react to this instead.";

/**
 * A panelist typed directly into the screen is already saved there — the
 * human_panelist tool is only for a visitor who asks the agent (by voice) to
 * add someone. Without this, "the visitor just described a panelist" reads as
 * a request to save it, and the agent would call the tool and create a
 * duplicate of a panelist that already exists.
 */
const ALREADY_SAVED_NOTE =
  "This was typed directly into the screen and is already saved — do not call human_panelist for it, just react.";

/**
 * Synthetic user turn describing a click the visitor just made, used to prompt
 * an immediate spoken reaction. Phrased as an instruction rather than a state
 * blob: it is sent with a `response.create`, so the model is being asked to
 * say something, not just to absorb context.
 */
export function buildMeetingSetupReactionMessage(
  event: MeetingSetupUserEvent,
  changes?: CouncilChanges,
): string {
  const situation = describeSituation(event, changes);
  // Nothing left to report — e.g. a food was picked and unpicked inside the
  // same debounce window. Callers skip the reaction rather than interrupt the
  // agent to say nothing.
  if (situation == null) return "";
  return `(The visitor just ${situation} ${CUT_OFF_NOTE})`;
}

/**
 * Renders the council so the agent speaks of the chair as itself — "and myself,
 * Water, as the moderator" — rather than listing itself as a third party.
 */
function describeCouncil({ selectedNames, chairName, isFull, panelistNames }: CouncilRoster): string {
  const others = [...selectedNames, ...(panelistNames ?? [])];
  const asModerator = `yourself, ${chairName}, as the moderator`;
  const roster = others.length === 0
    ? `The council is currently just ${asModerator}.`
    : `The council is now ${others.join(", ")}, and ${asModerator}.`;
  // The UI has no room for another pick at this point — a natural, optional
  // aside rather than an instruction, so it only comes up if it fits.
  if (!isFull) return roster;
  return `${roster} The council is now full — feel free to mention that if it fits naturally.`;
}

/** Returns null when there is nothing worth reacting to. */
function describeSituation(
  event: MeetingSetupUserEvent,
  changes?: CouncilChanges,
): string | null {
  switch (event.type) {
    case "setup_started":
      return `left the welcome screen and moved on to the topic selection step. React briefly and help them choose a topic.`;
    case "topic_previewed":
      return `selected the topic "${event.topicTitle}" on screen, but has not confirmed it yet. React briefly to their choice.`;
    case "topic_committed":
      return `confirmed the topic "${event.topicTitle}" and moved on to the food selection step. React briefly and help them choose their foods.`;
    case "characters_randomized":
      return `picked a random group. ${describeCouncil(event)} React briefly to the mix.`;
    case "character_selected":
    case "character_deselected": {
      const change = describeChanges(changes);
      if (change == null) return null;
      return `${change}. ${describeCouncil(event)} React briefly.`;
    }
    // A blank name means the "add human" button just created a fresh slot;
    // a filled one means an existing panelist was toggled back in.
    case "human_selected":
      return event.humanName.length === 0
        ? `added a new human panelist to the council. ${describeCouncil(event)} They still need a name and a short description — you could invite them to fill that in. ${ALREADY_SAVED_NOTE}`
        : `brought ${event.humanName} back into the council. ${describeCouncil(event)} React briefly. ${ALREADY_SAVED_NOTE}`;
    // `describeSituation`'s caller prepends "The visitor just ", so this reads
    // as "...finished describing..." / "...typed more details...".
    case "human_details_typed":
    case "human_details_confirmed": {
      const { humanName, humanDescription, isComplete } = event;
      if (isComplete) {
        return `finished describing a human panelist: named "${humanName}", described as "${humanDescription}". ${describeCouncil(event)} React briefly, perhaps to the description itself. ${ALREADY_SAVED_NOTE}`;
      }
      const missing = humanName.length === 0 && humanDescription.length === 0
        ? "a name and a short description"
        : humanName.length === 0
          ? "a name"
          : "a short description";
      const named = humanName.length > 0 ? ` (currently named "${humanName}")` : "";
      return `typed more details for a human panelist${named}, but it still needs ${missing}. ${describeCouncil(event)} You could remind them, briefly. ${ALREADY_SAVED_NOTE}`;
    }
    case "human_deselected":
      return `took the human panelist ${event.deselectedName} out of the council. ${describeCouncil(event)} React briefly.`;
  }
}

/** Returns null when nothing changed on balance. */
function describeChanges(changes?: CouncilChanges): string | null {
  const added = changes?.added ?? [];
  const removed = changes?.removed ?? [];

  const parts: string[] = [];
  if (added.length > 0) parts.push(`added ${joinNames(added)} to the council`);
  if (removed.length > 0) parts.push(`removed ${joinNames(removed)} from the council`);

  return parts.length > 0 ? parts.join(" and ") : null;
}

export function buildTopicFromSelection(params: {
  topicsBundle: TopicsData;
  selectedTopicId: string;
  customTopic: string;
}): Topic {
  const { topicsBundle, selectedTopicId, customTopic } = params;
  const raw =
    topicsBundle.topics.find((topic: Topic) => topic.id === selectedTopicId) ??
    (selectedTopicId === topicsBundle.custom_topic.id ? topicsBundle.custom_topic : undefined);

  if (!raw) {
    throw new Error(`Topic not found: ${selectedTopicId}`);
  }

  const built = structuredClone(raw);
  if (built.id === topicsBundle.custom_topic.id) {
    built.prompt = (built.prompt || "").replace(VISITOR_INPUT_PLACEHOLDER, customTopic.trim());
    built.description = customTopic;
    built.agendaPoints = undefined;
  }
  built.prompt = buildMeetingSystemPrompt(
    topicsBundle.system,
    built.prompt,
    built.agendaPoints,
    topicsBundle.language,
  );
  return built;
}

/**
 * Validates character-selection state and builds the meeting `characters` payload,
 * including chair `[CHARACTERS]`, `[HUMANS]`, and `[RANDOM_AGENDA_POINT]` prompt injection.
 */
export function buildMeetingCharactersPayload(params: {
  language: string;
  selectedCharacters: string[];
  humans: Character[];
  numberOfHumans: number;
  labels: MeetingCharactersI18n;
  agendaPoints?: string[];
  isMuseumMode?: boolean;
}): { ok: true; characters: Character[] } | { ok: false; error: string } {
  const { language, humans, numberOfHumans, labels, agendaPoints, isMuseumMode = false } = params;
  let { selectedCharacters } = params;

  if (isMuseumMode) {
    selectedCharacters = orderSelectedCharactersForMuseum(selectedCharacters);
  }
  const characterSetupData = getCharacterSetupBundle(language);
  const baseCharacters = characterSetupData.characters;
  const characters = [...baseCharacters, ...humans.slice(0, numberOfHumans)];

  const minMembers = 2 + 1;
  const maxMembers = 6 + 1;

  if (selectedCharacters.filter((id) => !id.startsWith("panelist")).length < minMembers) {
    return {
      ok: false,
      error:
        "Select at least two council members besides the chair (three non-human participants minimum), then try again.",
    };
  }
  if (selectedCharacters.length > maxMembers) {
    return { ok: false, error: "Too many participants (at most six members plus the chair)." };
  }

  const selectedHumans = selectedCharacters.filter((id) => id.startsWith("panelist"));
  for (const humanId of selectedHumans) {
    const index = Number(humanId.slice(-1));
    const human = humans[index];
    if (!human || human.name.length === 0) {
      return {
        ok: false,
        error: "Each human panelist needs a name before starting.",
      };
    }
    if (!isMuseumMode && (human.description?.length ?? 0) === 0) {
      return {
        ok: false,
        error: "Each human panelist needs a name and description before starting.",
      };
    }
  }

  const names = selectedCharacters.map((id) => characters.find((character) => character.id === id)?.name);
  if (names.some((name) => name === undefined)) {
    return { ok: false, error: "Selection references an unknown participant." };
  }
  if (new Set(names).size !== names.length) {
    return { ok: false, error: "All participants must have unique names." };
  }

  const participatingFoods = selectedCharacters.filter((id) => !id.startsWith("panelist"));
  const participatingHumans = selectedCharacters.filter((id) => id.startsWith("panelist"));

  let participants = "";
  for (const [index, id] of participatingFoods.entries()) {
    const character = characters.find((item) => item.id === id);
    if (index !== 0 && character) {
      participants += `${toTitleCase(character.name)}, `;
    }
  }
  if (participants.length > 2) {
    participants = participants.substring(0, participants.length - 2);
  }

  const replacedCharacters: Character[] = [];
  for (const id of selectedCharacters) {
    const found = characters.find((character) => character.id === id);
    if (found) {
      replacedCharacters.push(structuredClone(found));
    }
  }

  if (replacedCharacters.length > 0 && replacedCharacters[0].prompt) {
    replacedCharacters[0].prompt =
      characterSetupData.characters[0].prompt?.replace("[CHARACTERS]", participants) || "";
  }

  let humanPresentation = "";
  if (participatingHumans.length > 0) {
    humanPresentation += labels.formatHumanCount(participatingHumans.length);

    for (const id of participatingHumans) {
      const human = characters.find((character) => character.id === id);
      if (human) {
        const role = human.description?.trim() || "guest";
        humanPresentation += `${toTitleCase(human.name)} (${role}). `;
      }
    }
    humanPresentation = humanPresentation.substring(0, humanPresentation.length - 2);

    humanPresentation = characterSetupData.panelWithHumans.replace("[HUMANS]", humanPresentation);
  }

  if (replacedCharacters.length > 0 && replacedCharacters[0].prompt) {
    replacedCharacters[0].prompt = replacedCharacters[0].prompt.replace("[HUMANS]", humanPresentation);
    replacedCharacters[0].prompt = injectRandomAgendaPoint(replacedCharacters[0].prompt, agendaPoints);
  }

  return { ok: true, characters: replacedCharacters };
}

export type MeetingFoodsI18n = MeetingCharactersI18n;
export const buildMeetingFoodsPayload = buildMeetingCharactersPayload;
