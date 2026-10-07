/**
 * Has every being say the same lines through its real TTS voice and measures how loud each one
 * comes out, to choose `voiceLoudness` in global-options.json: the target level, and the
 * `skipBelowDb` threshold under which a message is left as generated.
 *
 * Costs a few cents of TTS per run (beings × languages × takes short lines). Each take is saved
 * as generated and as normalized, so the two can be compared by ear.
 *
 *   npm run voices:loudness -- [--lang <code>|all] [--takes 3] [--only mountain,bumblebee] [--out dir]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getCharacterSetupBundle } from "@logic/characterSetupBundle.js";
import { getGlobalOptions } from "@logic/GlobalOptions.js";
import { measureLoudness, normalizeLoudness } from "@logic/audio/AudioUtils.js";
import {
    generateElevenLabsAudio,
    generateInworldAudio,
    generateOpenAIAudio,
    type AudioResult,
} from "@logic/audio/TTSProviders.js";
import type { AudioSystemOptions, Speaker } from "@logic/audio/AudioTypes.js";
import { getOpenAI, initOpenAI } from "@services/OpenAIService.js";
import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages.js";

function arg(name: string, fallback: string): string {
    const index = process.argv.indexOf(`--${name}`);
    return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const LANGUAGES: string[] = arg("lang", "all") === "all" ? [...AVAILABLE_LANGUAGES] : [arg("lang", "en")];
const TAKES = Number(arg("takes", "3"));
const ONLY = arg("only", "").split(",").filter(Boolean);
const OUT = arg("out", path.join(tmpdir(), `voice-loudness-${Date.now()}`));

/** Ordinary council speech, the same for every being, so only the voice differs. One per language. */
const LINES: Record<string, string> = {
    en: "We have gathered here for a long time, and still the world is waiting for an answer. "
        + "I will say it plainly: what is taken from the land must be given back, or nothing grows again. "
        + "Listen to the others, but do not forget who was here first.",
    sv: "Vi har samlats här länge, och fortfarande väntar världen på ett svar. "
        + "Jag säger det rakt ut: det som tas från marken måste ges tillbaka, annars växer ingenting igen. "
        + "Lyssna på de andra, men glöm inte vem som var här först.",
};

const options = getGlobalOptions();
const loudness = options.voiceLoudness ?? { targetLufs: -18, skipBelowDb: 1.5, truePeakDb: -1.5 };

function synthesize(text: string, speaker: Speaker, audioOptions: AudioSystemOptions): Promise<AudioResult> {
    const params = { text, speaker, options: audioOptions };
    if (speaker.voiceProvider === "inworld") return generateInworldAudio(params);
    if (speaker.voiceProvider === "elevenlabs") return generateElevenLabsAudio(params);
    return generateOpenAIAudio({ ...params, services: { getOpenAI } });
}

const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const fmt = (value: number, signed = false): string => `${signed && value > 0 ? "+" : ""}${value.toFixed(1)}`;

interface Row { language: string; id: string; takes: number[] }

async function main(): Promise<void> {
    initOpenAI();
    await mkdir(OUT, { recursive: true });
    const rows: Row[] = [];

    for (const language of LANGUAGES) {
        const audioOptions: AudioSystemOptions = { ...options, language };
        const characters = getCharacterSetupBundle(language).characters
            .filter((character) => ONLY.length === 0 || ONLY.includes(character.id));

        await Promise.all(characters.map(async (character) => {
            const speaker: Speaker = {
                ...character,
                voiceProvider: character.voiceProvider as Speaker["voiceProvider"],
            };
            const takes: number[] = [];
            for (let take = 1; take <= TAKES; take++) {
                const { audio } = await synthesize(LINES[language], speaker, audioOptions);
                const measured = await measureLoudness(audio);
                if (measured === null) continue;
                takes.push(measured);

                const name = `${language}-${character.id}-${take}`;
                const normalized = await normalizeLoudness(audio, { ...loudness, skipBelowDb: 0 });
                await writeFile(path.join(OUT, `${name}.ogg`), audio);
                await writeFile(path.join(OUT, `${name}-normalized.ogg`), normalized.audio);
            }
            rows.push({ language, id: character.id, takes });
            process.stdout.write(".");
        }));
    }
    process.stdout.write("\n\n");

    const all = rows.flatMap((row) => row.takes);
    const suggestedTarget = median(all);
    const target = loudness.targetLufs;

    console.log(`Configured target ${fmt(target)} LUFS; median of every take ${fmt(suggestedTarget)} LUFS.\n`);
    console.log("lang  being            mean LUFS  range         spread  gain to target");
    for (const row of rows.sort((a, b) => a.language.localeCompare(b.language) || a.id.localeCompare(b.id))) {
        if (row.takes.length === 0) {
            console.log(`${row.language.padEnd(6)}${row.id.padEnd(17)}silent`);
            continue;
        }
        const mean = row.takes.reduce((sum, value) => sum + value, 0) / row.takes.length;
        const min = Math.min(...row.takes);
        const max = Math.max(...row.takes);
        console.log(
            `${row.language.padEnd(6)}${row.id.padEnd(17)}${fmt(mean).padStart(9)}  `
            + `${`${fmt(min)} … ${fmt(max)}`.padEnd(14)}${fmt(max - min).padStart(6)}  `
            + `${fmt(target - mean, true).padStart(14)} dB`,
        );
    }

    console.log("\nShare of takes a threshold would leave untouched (at the configured target):");
    for (const threshold of [0.5, 1, 1.5, 2, 3]) {
        const skipped = all.filter((value) => Math.abs(target - value) < threshold).length;
        console.log(`  skipBelowDb ${fmt(threshold).padStart(3)}: ${skipped}/${all.length}`);
    }
    console.log(`\nAudio (as generated, and normalized) in ${OUT}`);
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
