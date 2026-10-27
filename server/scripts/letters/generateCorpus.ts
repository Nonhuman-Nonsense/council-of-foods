/**
 * Generates a set of full-length meetings to develop the letters against (see
 * docs/council-letters.md). Text only, with today's topic and being prompts and production
 * settings, written to the database in .env and tagged so evalLetters.ts can find them.
 *
 * Every meeting runs through the server's real MeetingManager — speaker selection, directed
 * hand-offs, the chair's invitation — with audio switched off. Human questions go in through the
 * same raise_hand / submit_human_message events a client sends. Only the setup the client normally
 * does (building the system prompt, the chair's participant list, the agenda point) is repeated
 * here, from shared/.
 *
 *   npm run letters:corpus -- [--count 16] [--parallel 4] [--tag letters] [--seed 1]
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Socket } from "socket.io";
import type { Character, Message, Topic } from "@shared/ModelTypes.js";
import type { StoredMeeting } from "@models/DBModels.js";
import { buildMeetingSystemPrompt } from "@shared/topicPrompt.js";
import { CHARACTERS_FILE } from "@shared/prompts/characterSetupMetadata.js";
import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages.js";
import { injectRandomAgendaPoint } from "@shared/agendaPointInjection.js";
import { closeDb, initDb, insertMeeting, meetingsCollection } from "@services/DbService.js";
import { initOpenAI } from "@services/OpenAIService.js";
import { MeetingManager } from "@logic/MeetingManager.js";
import { getGlobalOptions } from "@logic/GlobalOptions.js";
import { v4 as uuidv4 } from "uuid";
import { HUMAN_QUESTIONS, type HumanLine } from "./humanLines.js";

const PROMPTS_DIR = path.join(process.cwd(), "../shared/prompts");
const MEETING_TIMEOUT_MS = 12 * 60 * 1000;
const POLL_MS = 500;

/* -------------------------------------------------------------------------- */
/* Arguments                                                                  */
/* -------------------------------------------------------------------------- */

function arg(name: string, fallback: string): string {
    const index = process.argv.indexOf(`--${name}`);
    return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const COUNT = Number(arg("count", "16"));
const PARALLEL = Number(arg("parallel", "4"));
const TAG = arg("tag", "letters");
const SEED = Number(arg("seed", "1"));

/** Deterministic, so the same seed plans the same set of meetings. */
function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const random = rng(SEED);
const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
function shuffled<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

/* -------------------------------------------------------------------------- */
/* Plan                                                                       */
/* -------------------------------------------------------------------------- */

interface TopicsBundle { system: string; topics: Topic[] }
interface BeingsBundle { panelWithHumans: string; characters: Character[] }

type Language = string;

interface PlannedMeeting {
    language: Language;
    topicId: string;
    characterIds: string[];
    humanName: string;
    question?: HumanLine;
    /** Spoken turns before the human raises their hand. */
    questionAfter: number;
}

const HUMAN_NAMES = ["Visitor", "Anna", "Mikael", "Sara", "Johan", "Elin"];

async function readJson<T>(file: string): Promise<T> {
    return JSON.parse(await readFile(path.join(PROMPTS_DIR, file), "utf8")) as T;
}

/**
 * Two meetings per topic, about a quarter in Swedish where the product speaks it, a different set
 * of 3–6 members each (rotated so every one appears several times), and a human question in about
 * three in four.
 */
function planMeetings(topicIds: string[], beingIds: string[]): PlannedMeeting[] {
    const [chair, ...members] = beingIds;
    const languages: readonly string[] = AVAILABLE_LANGUAGES;
    const swedish = new Set(languages.includes("sv") ? [1, 6, 10, 15].filter((i) => i < COUNT) : []);
    const questions: Record<string, HumanLine[]> = Object.fromEntries(
        languages.map((language) => [language, shuffled(HUMAN_QUESTIONS.filter((q) => q.language === language))]),
    );
    let pool: string[] = [];

    return Array.from({ length: COUNT }, (_, i) => {
        const language = swedish.has(i) ? "sv" : languages[0];
        const size = 3 + Math.floor(random() * 4);
        const chosen: string[] = [];
        while (chosen.length < size) {
            if (pool.length === 0) pool = shuffled(members);
            const next = pool.shift()!;
            if (!chosen.includes(next)) chosen.push(next);
        }
        const asks = random() < 0.75 && (questions[language]?.length ?? 0) > 0;
        return {
            language,
            topicId: topicIds[i % topicIds.length],
            characterIds: [chair, ...chosen],
            humanName: pick(HUMAN_NAMES),
            question: asks ? questions[language].shift() : undefined,
            questionAfter: 3 + Math.floor(random() * 4),
        };
    });
}

/* -------------------------------------------------------------------------- */
/* Setup, as the client does it (client/src/newMeeting/meetingSetup.ts)       */
/* -------------------------------------------------------------------------- */

const titleCase = (text: string) =>
    text.toLowerCase().split(" ").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

function buildMeetingDoc(plan: PlannedMeeting, topics: TopicsBundle, beings: BeingsBundle): Omit<StoredMeeting, "_id"> {
    const topic = structuredClone(topics.topics.find((t) => t.id === plan.topicId)!);
    topic.prompt = buildMeetingSystemPrompt(topics.system, topic.prompt, topic.agendaPoints, plan.language);

    const characters = plan.characterIds.map((id) => structuredClone(beings.characters.find((c) => c.id === id)!));
    const participants = characters.slice(1).map((c) => titleCase(c.name)).join(", ");
    characters[0].prompt = injectRandomAgendaPoint(
        characters[0].prompt.replace("[CHARACTERS]", participants).replace("[HUMANS]", ""),
        topic.agendaPoints,
    );

    return {
        topic,
        characters,
        language: plan.language,
        audio: [],
        conversation: [],
        liveKey: uuidv4(),
        date: new Date().toISOString(),
        state: { alreadyInvited: false, humanName: plan.humanName },
        maximumPlayedIndex: 0,
        conversationExtraSlots: 0,
        meetingComplete: false,
        devCorpus: { tag: TAG, visitorKind: plan.question?.kind ?? null },
    } as Omit<StoredMeeting, "_id">;
}

/* -------------------------------------------------------------------------- */
/* Running                                                                    */
/* -------------------------------------------------------------------------- */

const spoken = (conversation: Message[]) => conversation.filter((m) => typeof m.text === "string" && m.text !== "").length;
const last = (conversation: Message[]) => conversation[conversation.length - 1];

async function waitFor(manager: MeetingManager, done: (conversation: Message[]) => boolean, what: string, deadline: number) {
    while (!done(manager.meeting?.conversation ?? [])) {
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
}

/** Nothing listens: the meeting is read back from the database afterwards. */
function silentSocket(id: string): Socket {
    return { id, emit: () => true, on: () => undefined } as unknown as Socket;
}

async function runMeeting(index: number, plan: PlannedMeeting, topics: TopicsBundle, beings: BeingsBundle) {
    const doc = buildMeetingDoc(plan, topics, beings);
    const { insertedId: meetingId } = await insertMeeting(doc);
    const label = `#${meetingId} ${plan.language} ${plan.topicId} [${plan.characterIds.slice(1).join(", ")}]`;
    console.log(`▶ ${index + 1}/${COUNT} ${label}${plan.question ? ` · human (${plan.question.kind}) after ${plan.questionAfter}` : ""}`);

    const manager = new MeetingManager(silentSocket(`corpus-${meetingId}`), "prototype", { ...getGlobalOptions(), skipAudio: true });
    const deadline = Date.now() + MEETING_TIMEOUT_MS;
    const started = Date.now();
    try {
        await manager.initializeStart({ meetingId, liveKey: doc.liveKey });

        if (plan.question) {
            await waitFor(manager, (c) => spoken(c) >= plan.questionAfter || last(c)?.type === "query_extension", "the human's moment", deadline);
            if (last(manager.meeting!.conversation)?.type !== "query_extension") {
                await manager.handleEvent("raise_hand", { index: manager.meeting!.conversation.length, humanName: plan.humanName });
                await waitFor(manager, (c) => last(c)?.type === "awaiting_human_question", "the chair's invitation", deadline);
                await manager.handleEvent("submit_human_message", { text: plan.question.text });
            }
        }

        await waitFor(manager, (c) => last(c)?.type === "query_extension", "the end of the meeting", deadline);
        console.log(`✔ ${label} · ${spoken(manager.meeting!.conversation)} turns · ${Math.round((Date.now() - started) / 1000)} s`);
        return { meetingId, ok: true };
    } catch (error) {
        console.error(`✘ ${label}: ${(error as Error).message}`);
        return { meetingId, ok: false };
    } finally {
        await manager.destroy("cancel");
    }
}

async function main() {
    await initDb();
    initOpenAI();

    const bundles: Record<string, { topics: TopicsBundle; beings: BeingsBundle }> = Object.fromEntries(
        await Promise.all(AVAILABLE_LANGUAGES.map(async (language) => [language, {
            topics: await readJson<TopicsBundle>(`topics_${language}.json`),
            beings: await readJson<BeingsBundle>(`${CHARACTERS_FILE}_${language}.json`),
        }] as const)),
    );
    const first = bundles[AVAILABLE_LANGUAGES[0]];

    const plans = planMeetings(first.topics.topics.map((t) => t.id), first.beings.characters.map((c) => c.id));
    const options = getGlobalOptions();
    console.log(`Generating ${plans.length} meetings tagged "${TAG}" with ${options.conversationModel}, ${PARALLEL} at a time.\n`);

    const results: Array<{ meetingId: number; ok: boolean }> = [];
    let next = 0;
    await Promise.all(Array.from({ length: PARALLEL }, async () => {
        while (next < plans.length) {
            const index = next++;
            const plan = plans[index];
            results.push(await runMeeting(index, plan, bundles[plan.language].topics, bundles[plan.language].beings));
        }
    }));

    const failed = results.filter((r) => !r.ok).map((r) => r.meetingId);
    const total = await meetingsCollection.countDocuments({ "devCorpus.tag": TAG });
    console.log(`\nDone: ${results.length - failed.length} meetings generated${failed.length ? `, ${failed.length} failed (${failed.join(", ")})` : ""}. ${total} meetings now tagged "${TAG}".`);
    await closeDb();
    process.exit(failed.length ? 1 : 0);
}

await main();
