import type { Topic } from "@shared/ModelTypes";
import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages";

export interface TopicsData {
  metadata: {
    version: string;
    last_updated: string;
  };
  system: string;
  custom_topic: Topic;
  topics: Topic[];
}

// Topics bundles live in `src/prompts/`.
const topicModules = import.meta.glob<TopicsData>("/src/prompts/topics_*.json", {
  eager: true,
  import: "default",
});

const localTopicsData: Partial<Record<string, TopicsData>> = {};
for (const lang of AVAILABLE_LANGUAGES) {
  const moduleKey = Object.keys(topicModules).find((path) => path.endsWith(`topics_${lang}.json`));
  if (moduleKey) localTopicsData[lang] = topicModules[moduleKey];
}

// Fail fast on startup instead of letting the UI render with missing data.
for (const lang of AVAILABLE_LANGUAGES) {
  if (!localTopicsData[lang]) {
    const available = Object.keys(localTopicsData).sort().join(", ") || "(none)";
    throw new Error(
      `[topicsBundle] Missing topics bundle for lang "${lang}". Available: ${available}. ` +
        `Expected a file at /src/prompts/topics_${lang}.json`
    );
  }
}

const topicsData = localTopicsData as Record<string, TopicsData>;
Object.freeze(topicsData);
for (const language of Object.keys(topicsData)) {
  const bundle = topicsData[language];
  for (let i = 0; i < bundle.topics.length; i++) {
    Object.freeze(bundle.topics[i]);
  }
}

/** Frozen topics + system prompts for one UI language (wizard + #settings overlay). */
export function getTopicsBundle(lang: string): TopicsData {
  return topicsData[lang];
}
