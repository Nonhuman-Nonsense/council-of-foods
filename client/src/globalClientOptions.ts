import foodsEn from "@shared/prompts/foods_en.json";

export interface GlobalClientOptions {
    chairId: string;
}

/** Chair id from `foods[0]` in `foods_en` (validated in ValidateFoodData tests). */
export const globalClientOptions: GlobalClientOptions = {
    chairId: foodsEn.foods[0].id,
};
