export type RealtimeProvider = "inworld" | "openai";

export type RealtimeFeature = "voice-guide" | "human-input";

export interface IceServer {
    urls: string[] | string;
    username?: string;
    credential?: string;
}

export interface RealtimeBootstrapResponse {
    provider: RealtimeProvider;
    iceServers: IceServer[];
    /**
     * Provider-owned session payload echoed back to `/api/realtime/call`.
     * Voice-guide treats this as defaults to merge client instructions/tools into.
     * Human-input treats this as the full session to create.
     */
    session: Record<string, unknown>;
}

export interface HumanInputRealtimeBootstrapRequest {
    feature: "human-input";
    language: string;
}

export interface RealtimeCallResponse {
    id?: string;
    sdp: string;
    ice_servers?: IceServer[];
}

export interface HumanInputRealtimeCallRequest {
    feature: "human-input";
    provider: RealtimeProvider;
    sdp: string;
    session: Record<string, unknown>;
}

export interface VoiceGuideRealtimeBootstrapRequest {
    feature: "voice-guide";
}

export interface VoiceGuideRealtimeCallRequest {
    feature: "voice-guide";
    provider: "inworld";
    sdp: string;
    session: Record<string, unknown>;
}
