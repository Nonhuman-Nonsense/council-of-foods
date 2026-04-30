import { defaultCharacterSetupBundle } from "@/prompts/characterSetupBundles";

export interface GlobalClientOptions {
    chairId: string;
}

/** Chair id from the default character-setup bundle (validated in food data tests). */
export const globalClientOptions: GlobalClientOptions = {
    chairId: defaultCharacterSetupBundle.foods[0].id,
};
