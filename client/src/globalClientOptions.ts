import globalClientOptionsData from "@/global-options-client.json";

export interface GlobalClientOptions {
  audio_speed: number;
  chairId: string;
}

export const globalClientOptions: GlobalClientOptions = globalClientOptionsData;
