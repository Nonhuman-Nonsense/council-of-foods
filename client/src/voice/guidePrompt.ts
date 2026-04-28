import type { Topic, Character } from "@shared/ModelTypes";

export type GuideTopic = Pick<Topic, "id" | "title" | "description">;
export type GuideFood = Pick<Character, "id" | "name"> & { description?: string };

export type BuildGuidePromptParams = {
  baseSystemPrompt: string;
  projectDescription: string;
  topics: GuideTopic[];
  foods: GuideFood[];
};

function formatBullets(lines: string[]): string {
  return lines.map((l) => `- ${l}`).join("\n");
}

/**
 * Builds the system prompt for the voice guide.
 *
 * The prompt is intentionally short. We DO NOT inline topic/food descriptions
 * here; the model gets only id+title/name lists and is told to call the
 * `describe_topic` / `describe_food` tools when it needs detail. This keeps
 * the prompt under Inworld's tolerance and avoids the `server_error` failures
 * we hit with very long instructions.
 */
export function buildGuidePrompt(params: BuildGuidePromptParams): string {
  const { baseSystemPrompt, projectDescription, topics, foods } = params;

  const topicsList = topics.map((t) => `${t.id}: ${t.title}`);
  const foodsList = foods.map((f) => `${f.id}: ${f.name}`);

  return [
    baseSystemPrompt.trim(),
    "",
    "## Project",
    projectDescription.trim(),
    "",
    "## Your job",
    formatBullets([
      "Open with one short sentence inviting the visitor to choose a topic.",
      "Help the visitor pick a topic, then a small set of food characters, and optionally human panelists.",
      "Ask one question at a time and keep responses short.",
      "Use the provided tools to make every selection. Never claim you selected something unless a tool returned ok.",
      "If the visitor wants details, call describe_topic or describe_food and summarize briefly.",
      "Confirm the topic with confirm_topic before moving to the foods step.",
      "On the foods step, when selections are valid, call start_meeting to begin (same requirements as the Start button).",
    ]),
    "",
    "## Available topic ids",
    formatBullets(topicsList),
    "",
    "## Available food ids",
    formatBullets(foodsList),
  ].join("\n");
}
