import { config } from "@root/src/config.js";
import { getGlobalOptions } from "@logic/GlobalOptions.js";
import { letterBlocklistCollection, lettersCollection, meetingsCollection } from "@services/DbService.js";
import { findSentByTag, sendEmail } from "@services/MailService.js";
import { Logger } from "@utils/Logger.js";
import { loadRecipients, loadTopicIds } from "./recipients.js";
import { runOutbox, type LettersMode, type OutboxDeps } from "./outbox.js";

/** How often the worker looks for letters to queue and send. */
const TICK_MS = 30_000;

/**
 * Starts the outbox worker (see outbox.ts) on the server's own clock. `COUNCIL_LETTERS` decides
 * whether anything is sent; a mode that cannot work (test without an inbox, sending without
 * Brevo) falls back to `off` and says so.
 */
export function startLetterOutbox(): void {
    let mode: LettersMode = config.COUNCIL_LETTERS ?? "off";
    if (mode === "test" && !config.COUNCIL_LETTERS_TEST_TO) {
        void Logger.error("letters", "COUNCIL_LETTERS=test needs COUNCIL_LETTERS_TEST_TO; not sending letters");
        mode = "off";
    }
    if (mode !== "off" && !config.COUNCIL_BREVO_API_KEY) {
        void Logger.error("letters", `COUNCIL_LETTERS=${mode} needs COUNCIL_BREVO_API_KEY; not sending letters`);
        mode = "off";
    }
    Logger.info("init", `Letters: ${mode}${mode === "test" ? ` (to ${config.COUNCIL_LETTERS_TEST_TO})` : ""}`);

    const deps = (): OutboxDeps => ({
        meetings: meetingsCollection,
        letters: lettersCollection,
        blocklist: letterBlocklistCollection,
        options: getGlobalOptions(),
        loadRecipients: async () => loadRecipients(await loadTopicIds()),
        send: sendEmail,
        findSent: findSentByTag,
        mode,
        testTo: config.COUNCIL_LETTERS_TEST_TO,
        archiveTo: config.COUNCIL_LETTERS_ARCHIVE_TO,
    });

    let running = false;
    const tick = async () => {
        if (running) return; // a slow send never overlaps the next tick
        running = true;
        try {
            await runOutbox(deps());
        } catch (error) {
            await Logger.error("letters", "outbox turn failed", { error });
        } finally {
            running = false;
        }
    };
    setInterval(() => void tick(), TICK_MS).unref();
    void tick();
}
