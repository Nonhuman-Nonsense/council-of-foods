import globalOptions from '../../global-options.json' with { type: 'json' };

export interface GlobalOptions {
    gptModel: string;
    voiceModel: string;
    temperature: number;
    maxTokens: number;
    chairMaxTokens: number;
    frequencyPenalty: number;
    presencePenalty: number;
    audio_speed: number;
    trimSentance: boolean;
    trimParagraph: boolean;
    chairId: string;
    trimChairSemicolon: boolean;
    show_trimmed: boolean;
    skipAudio: boolean;
    conversationMaxLength: number;
    raiseHandPrompt: Record<string, string>;
    raiseHandInvitationLength: number;
    finalizeMeetingPrompt: Record<string, string>;
    finalizeMeetingLength: number;
    extraMessageCount: number;
    transcribeModel: string;
    transcribePrompt: Record<string, string>;
    audioConcurrency: number;
}

export const getGlobalOptions = (): GlobalOptions => {
    return { ...globalOptions } as GlobalOptions;
};
