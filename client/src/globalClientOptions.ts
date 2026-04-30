import { defaultCharacterSetupBundle } from "@/prompts/characterSetupBundles";

export interface GlobalClientOptions {
    chairId: string;
}

/** Chair id from the default character-setup bundle (validated in prompt data tests). */
export const globalClientOptions: GlobalClientOptions = {
    chairId: defaultCharacterSetupBundle.characters[0].id,
};
