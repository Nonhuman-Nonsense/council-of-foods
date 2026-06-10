import type { Message } from "@shared/ModelTypes.js";
import type { StoredMeeting } from "@models/DBModels.js";
import type { GlobalOptions } from "@logic/GlobalOptions.js";

import { Logger } from "@utils/Logger.js";
import { NextSpeakerClassifier } from "@logic/NextSpeakerClassifier.js";

export function isDirectedRoutingAnnotatable(message: Message): boolean {
    return message.type === "message" || message.type === "response" || message.type === "panelist";
}

export class DirectedSpeakerRouter {
    private serverOptions: GlobalOptions;
    private nextSpeakerClassifier: NextSpeakerClassifier;

    constructor(serverOptions: GlobalOptions) {
        this.serverOptions = serverOptions;
        this.nextSpeakerClassifier = new NextSpeakerClassifier(serverOptions);
    }

    async annotateIfDirected(
        meeting: StoredMeeting,
        message: Message,
        lastSpeakerId: string
    ): Promise<void> {
        if (!this.serverOptions.directedSpeakerRouting) return;
        if (!isDirectedRoutingAnnotatable(message)) return;

        const { rawOutput, targetId } = await this.nextSpeakerClassifier.inferTarget(meeting, message);
        let askParticular: string | undefined;

        if (targetId && targetId !== lastSpeakerId) {
            (message as Message & { askParticular?: string }).askParticular = targetId;
            askParticular = targetId;
        }

        Logger.info(
            `meeting ${meeting._id}`,
            `[directed-routing] after=${lastSpeakerId} raw="${rawOutput}" askParticular=${askParticular ?? "(none)"}`
        );
    }
}
