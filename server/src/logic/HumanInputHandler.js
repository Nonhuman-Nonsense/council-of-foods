import { v4 as uuidv4 } from "uuid";
import { splitSentences } from "../utils/textUtils.js";

export class HumanInputHandler {
    constructor(meetingManager) {
        this.manager = meetingManager;
    }

    handleSubmitHumanMessage(message) {
        const { manager } = this;
        console.log(`[meeting ${manager.meetingId}] human input on index ${manager.conversation.length - 1}`);

        if (manager.conversation[manager.conversation.length - 1].type !== 'awaiting_human_question') {
            console.error("Received a human question but was not expecting one!");
            return;
        }
        manager.conversation.pop();

        if (manager.conversation[manager.conversation.length - 1].type === 'invitation') {
            console.log(`[meeting ${manager.meetingId}] popping invitation down to index ${manager.conversation.length - 1}`);
            manager.conversation.pop();
        }

        if (message.askParticular) {
            console.log(`[meeting ${manager.meetingId}] specifically asked to ${message.askParticular}`);
            message.text = message.speaker + " asked " + message.askParticular + ":\xa0" + message.text;
        } else {
            message.text = message.speaker + (manager.conversationOptions.language === 'en' ? " said:\xa0" : " sa:\xa0") + message.text;
        }

        message.id = "human-" + uuidv4();
        message.type = "human";
        message.speaker = manager.conversationOptions.state.humanName;

        manager.conversation.push(message);

        manager.services.meetingsCollection.updateOne(
            { _id: manager.meetingId },
            { $set: { conversation: manager.conversation } }
        );

        manager.socket.emit("conversation_update", manager.conversation);

        message.sentences = splitSentences(message.text);
        manager.audioSystem.queueAudioGeneration(
            message,
            manager.conversationOptions.characters[0],
            manager.conversationOptions.options,
            manager.meetingId,
            manager.environment
        );

        manager.isPaused = false;
        manager.handRaised = false;
        manager.startLoop();
    }

    handleSubmitHumanPanelist(message) {
        const { manager } = this;
        console.log(`[meeting ${manager.meetingId}] human panelist ${message.speaker} on index ${manager.conversation.length - 1}`);

        if (manager.conversation[manager.conversation.length - 1].type !== 'awaiting_human_panelist') {
            console.error("Received a human panelist but was not expecting one!");
            return;
        }
        manager.conversation.pop();

        const charName = manager.conversationOptions.characters.find(c => c.id === message.speaker)?.name || "Unknown";
        message.text = charName + (manager.conversationOptions.language === 'en' ? " said:\xa0" : " sa:\xa0") + message.text;
        message.id = message.speaker + uuidv4();
        message.type = "panelist";

        manager.conversation.push(message);

        manager.services.meetingsCollection.updateOne(
            { _id: manager.meetingId },
            { $set: { conversation: manager.conversation } }
        );

        manager.socket.emit("conversation_update", manager.conversation);

        message.sentences = splitSentences(message.text);
        manager.audioSystem.queueAudioGeneration(
            message,
            manager.conversationOptions.characters[0],
            manager.conversationOptions.options,
            manager.meetingId,
            manager.environment
        );

        manager.isPaused = false;
        manager.handRaised = false;
        manager.startLoop();
    }

    async handleSubmitInjection(message) {
        const { manager } = this;
        if (manager.environment !== "prototype") return;

        let { response, id } = await manager.dialogGenerator.chairInterjection(
            message.text.replace("[DATE]", message.date),
            message.index,
            message.length,
            true,
            manager.conversation,
            manager.conversationOptions,
            manager.socket
        );

        let summary = {
            id: id,
            speaker: manager.conversationOptions.characters[0].id,
            text: response,
            type: "interjection",
        };

        manager.conversation.push(summary);

        manager.socket.emit("conversation_update", manager.conversation);
        console.log(`[meeting ${manager.meetingId}] interjection generated on index ${manager.conversation.length - 1}`);

        summary.sentences = splitSentences(response);
        // Note: original called this.generateAudio, which handles audio generation
        // But MeetingManager refs audioSystem now.
        // Wait, MeetingManager.js:122 calls this.generateAudio(summary, ...)
        // But I just refactored MeetingManager to use audioSystem directly?
        // Let's check MeetingManager line 122 in previous view.
        // Ah, line 122 in MeetingManager used `this.generateAudio`.
        // I deleted the duplicate `generateAudio` but `MeetingManager` still HAD `generateAudio` (the one I renamed back to `generateAudio`).
        // Wait, step 365 deleted the duplicate.
        // Step 327 renamed one to `generateAudio`.
        // So `MeetingManager` DOES have `generateAudio`.
        // But `HumanInputHandler` assumes `manager` structure.
        // If I move `handleWrapUpMeeting` to LifecycleHandler, `MeetingManager` might LOSE `generateAudio` if I move it too?
        // No, `generateAudio` is core utility, probably strictly belongs to `AudioSystem` now?
        // In Step 369, I updated `handleWrapUpMeeting` to use `this.audioSystem.generateAudio`.
        // The `MeetingManager` still has `generateAudio`?
        // Let's check if I deleted `generateAudio` entirely from `MeetingManager` in step 365?
        // Yes, step 365 diff shows `-    async generateAudio` being removed.
        // Wait, I had TWO.
        // One was `handleWrapUpMeeting` (the duplicate). I renamed it to `generateAudio`.
        // Then step 365 removed `generateAudio`?
        // If I removed it, then `MeetingManager` NO LONGER has `generateAudio`.
        // So I should use `manager.audioSystem.generateAudio`.

        manager.audioSystem.queueAudioGeneration(
            summary,
            manager.conversationOptions.characters[0],
            manager.conversationOptions.options,
            manager.meetingId,
            manager.environment
        );
    }
}
