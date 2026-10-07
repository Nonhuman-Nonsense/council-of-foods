import type { Character, LetterView, Message } from "@shared/ModelTypes.js";
import type { ILifecycleContext } from "@interfaces/MeetingInterfaces.js";
import type { MeetingLetter, StoredMeeting } from "@models/DBModels.js";
import type { Message as AudioMessage } from "@logic/AudioSystem.js";
import type { LetterForm } from "./prompts/letterPrompts.js";

import { v4 as uuidv4 } from "uuid";
import { splitSentences } from "@shared/textUtils.js";
import { Logger } from "@utils/Logger.js";
import {
    draftLetter,
    finishLetter,
    pickAuthor,
    planLetter,
    selectAsksReply,
    selectLetterForm,
    sortHumanAddition,
    type LetterContext,
    type LetterDraft,
    type LetterPlan,
    type SortedAddition,
} from "./LetterWriter.js";
import { candidateRecipients, loadRecipients, loadTopicIds, type Recipient } from "./recipients.js";
import { letterSender } from "./outbox.js";
import { loadLetterHistory, type LetterHistory } from "./history.js";
import { letterBlocklistCollection, lettersCollection } from "@services/DbService.js";

/**
 * The letter ending of a meeting (docs/council-letters.md → "The meeting ending"), on top of
 * the plain letter steps in LetterWriter.ts. Each phase ends in a durable marker, written in one
 * go with what was said, so a reconnect resumes exactly there (RESILIENCE.md):
 *
 *   closing line + bridge, `letter_pending`           ← {@link chooseAuthor}, then the conclude
 *   announcement, `awaiting_letter_addition`          ← {@link announce}, a run-loop turn
 *   the human's words or a skip, `summary_pending`    ← HumanInputHandler
 *   `summary` carrying the letter                     ← {@link writeSummary}, a run-loop turn
 *
 * The slow steps start early and run while something else plays: the plan while the chair
 * closes, the draft while the author announces and the human thinks. That work lives in this
 * session only. A reconnect builds a new session, which simply does the step again — the same
 * code path, a little slower.
 */

interface PlannedLetter {
    plan: LetterPlan;
    recipient: Recipient;
    form: LetterForm;
    asksReply: boolean;
}

export interface LetterSummary {
    summary: Message;
    reader: Character;
    spoken: string;
    letter: MeetingLetter;
}

const NO_ADDITION: SortedAddition = { text: "", handling: "none", reason: "", raw: "" };

export class LetterEnding {
    private planning: { meetingId: number; authorId: string; work: Promise<PlannedLetter> } | null = null;
    private drafting: { meetingId: number; work: Promise<LetterDraft> } | null = null;

    constructor(private readonly manager: ILifecycleContext) {}

    private context(meeting: StoredMeeting): LetterContext {
        return { meeting, options: this.manager.serverOptions, dialogGenerator: this.manager.dialogGenerator };
    }

    private async recipientsAndHistory(meeting: StoredMeeting): Promise<{ recipients: Recipient[]; history: LetterHistory }> {
        const recipients = await loadRecipients(await loadTopicIds());
        const history = await loadLetterHistory({
            meetings: this.manager.services.meetingsCollection,
            letters: lettersCollection,
            blocklist: letterBlocklistCollection,
        }, recipients, {
            now: new Date(),
            excludeMeetingId: meeting._id,
        });
        return { recipients, history };
    }

    private async plan(meeting: StoredMeeting, authorId: string, recipients: Recipient[], history: LetterHistory): Promise<PlannedLetter> {
        const candidates = candidateRecipients(recipients, meeting.topic.id, {
            max: this.manager.serverOptions.letterMaxCandidates,
            exclude: history.exclude,
        });
        const plan = await planLetter(this.context(meeting), authorId, candidates, history.recentAsks);
        const recipient = recipients.find((candidate) => candidate.id === plan.recipientId);
        if (!recipient) throw new Error(`planned recipient ${plan.recipientId} is not on the list`);
        return { plan, recipient, form: selectLetterForm(history.recentForms), asksReply: selectAsksReply() };
    }

    /**
     * Ranks the members and picks the author, before the chair's closing line so the chair can
     * hand over to them by name, and starts the plan — it runs while the closing line is
     * written and spoken.
     */
    async chooseAuthor(): Promise<Character> {
        const meeting = this.manager.meeting!;
        const { recipients, history } = await this.recipientsAndHistory(meeting);
        const choice = await pickAuthor(this.context(meeting), history.recentAuthors);
        const work = this.plan(meeting, choice.authorId, recipients, history);
        work.catch(() => { /* announce() plans again */ });
        this.planning = { meetingId: meeting._id, authorId: choice.authorId, work };
        Logger.info("letters", `${choice.authorId} will write the letter (${choice.reason || "no reason given"})`, { from: this.manager });
        return meeting.characters.find((character) => character.id === choice.authorId)!;
    }

    /**
     * Resolves `letter_pending`: the author says aloud who they write to and what they will ask,
     * ending by asking the human to add something. Replaces the marker with that announcement and
     * `awaiting_letter_addition` in one write, then starts the draft.
     */
    async announce(): Promise<void> {
        const { manager } = this;
        const meeting = manager.meeting;
        if (!meeting?.conversation.some((message) => message.type === "letter_pending")) return;
        // Throw rather than return: the run loop would otherwise ask for the announcement forever.
        if (!meeting.letter) throw new Error("a letter announcement is owed, but no author was saved");

        const { authorId } = meeting.letter;
        const started = this.planning?.meetingId === meeting._id && this.planning.authorId === authorId
            ? await this.planning.work.catch((error: unknown) => {
                Logger.warn("letters", `plan failed, planning again: ${(error as Error).message}`, { from: manager });
                return null;
            })
            : null;
        const planned = started ?? await (async () => {
            const { recipients, history } = await this.recipientsAndHistory(meeting);
            return this.plan(meeting, authorId, recipients, history);
        })();
        if (!manager.isActive) return;

        const author = meeting.characters.find((character) => character.id === authorId)!;
        const announcement: Message = {
            id: `letter-announcement-${uuidv4()}`,
            type: "message",
            speaker: authorId,
            text: planned.plan.spokenText,
            sentences: splitSentences(planned.plan.spokenText),
        };
        const at = meeting.conversation.findIndex((message) => message.type === "letter_pending");
        if (at === -1) return;
        meeting.conversation.splice(at, 1, announcement, {
            type: "awaiting_letter_addition",
            speaker: meeting.state.humanName || "Human",
            text: "",
        });
        meeting.letter = {
            ...meeting.letter,
            recipientId: planned.recipient.id,
            points: planned.plan.points,
            form: planned.form,
            asksReply: planned.asksReply,
        };

        await manager.services.meetingsCollection.updateOne(
            { _id: meeting._id },
            { $set: { conversation: meeting.conversation, letter: meeting.letter } },
        );
        manager.broadcaster.broadcastConversationUpdate(meeting.conversation);
        Logger.info("letters", `${authorId} announced a letter to ${planned.recipient.id}`, { from: manager });

        manager.audioSystem.queueAudioGeneration(
            announcement as AudioMessage, author, meeting, manager.environment, manager.serverOptions,
        );
        this.startDraft(meeting, planned);
    }

    private startDraft(meeting: StoredMeeting, planned: PlannedLetter): void {
        const work = draftLetter(this.context(meeting), {
            authorId: meeting.letter!.authorId,
            recipient: planned.recipient,
            points: planned.plan.points,
            form: planned.form,
            asksReply: planned.asksReply,
        }).then(async (draft) => {
            // Kept, so a reconnect while the human thinks does not write the letter again.
            if (this.manager.isActive && meeting.letter) {
                meeting.letter.draft = { subject: draft.subject, body: draft.body };
                await this.manager.services.meetingsCollection.updateOne(
                    { _id: meeting._id },
                    { $set: { "letter.draft": meeting.letter.draft } },
                );
            }
            return draft;
        });
        work.catch(() => { /* writeSummary() drafts again */ });
        this.drafting = { meetingId: meeting._id, work };
    }

    private async draft(meeting: StoredMeeting, letter: MeetingLetter, recipient: Recipient): Promise<LetterDraft> {
        const started = this.drafting?.meetingId === meeting._id
            ? await this.drafting.work.catch((error: unknown) => {
                Logger.warn("letters", `draft failed, drafting again: ${(error as Error).message}`, { from: this.manager });
                return null;
            })
            : null;
        if (started) return started;
        const form = letter.form ?? selectLetterForm([]);
        const asksReply = letter.asksReply ?? false;
        if (letter.draft) {
            return { form, asksReply, authorId: letter.authorId, recipientId: recipient.id, ...letter.draft, prompt: "", raw: "" };
        }
        return draftLetter(this.context(meeting), {
            authorId: letter.authorId, recipient, points: letter.points ?? [], form, asksReply,
        });
    }

    /**
     * The letter as the meeting's summary, once the human has answered or not: their words
     * sorted and woven in, set apart, or left out. Read aloud by its author. Throws rather than
     * return nothing: the run loop would otherwise ask for the summary again, and again.
     */
    async writeSummary(): Promise<LetterSummary> {
        const meeting = this.manager.meeting;
        const letter = meeting?.letter;
        if (!meeting || !letter?.recipientId) throw new Error("a letter summary is owed, but no letter was planned");

        const recipients = await loadRecipients(await loadTopicIds());
        const recipient = recipients.find((candidate) => candidate.id === letter.recipientId);
        if (!recipient) throw new Error(`letter recipient ${letter.recipientId} is no longer on the list`);

        const ctx = this.context(meeting);
        const draft = await this.draft(meeting, letter, recipient);
        const human = letter.present && letter.addition ? await sortHumanAddition(ctx, letter.addition) : NO_ADDITION;
        const finished = await finishLetter(ctx, draft, recipient, human);

        const author = meeting.characters.find((character) => character.id === letter.authorId)!;
        const present = letter.present === true;
        const sendsLetters = meeting.sendsLetters === true;
        const send = present && sendsLetters;
        const sendReason = send ? null : !present ? "the human did not answer" : "this app mode does not send letters";
        const spoken = [finished.body, finished.humanNote].filter(Boolean).join("\n\n");
        const finishedAt = new Date().toISOString();

        const view: LetterView = {
            authorId: author.id,
            authorName: author.name,
            authorEmail: letterSender(ctx.options, author.id, author.name).email,
            recipientName: recipient.name,
            recipientOrganisation: recipient.organisation ?? null,
            recipientEmail: recipient.email,
            sentAt: finishedAt,
            subject: finished.subject,
            body: finished.body,
            humanNote: finished.humanNote,
            footer: finished.footer,
            present,
            send,
            sendReason,
        };
        return {
            summary: { id: `letter-${uuidv4()}`, type: "summary", speaker: author.id, text: spoken, sentences: [], letter: view },
            reader: author,
            spoken,
            letter: {
                ...letter,
                draft: { subject: draft.subject, body: draft.body },
                finishedAt,
                subject: finished.subject,
                body: finished.body,
                humanNote: finished.humanNote,
                footer: finished.footer,
                handling: finished.human.handling,
                humanContributed: finished.humanContributed,
                send,
                sendReason,
            },
        };
    }
}
