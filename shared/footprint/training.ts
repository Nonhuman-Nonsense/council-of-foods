/**
 * The one-off cost of making the models the council uses: training and, where reported, the
 * hardware and data centres behind it. Inherited, not caused per meeting — so it is shown as a
 * whole, never divided per request (no provider publishes how many requests a model serves).
 *
 * Only figures a provider has published. Where nothing is published, that absence is the entry.
 * See docs/ai-footprint-meter.md.
 */

export interface TrainingDisclosure {
    /** Model the council calls. */
    model: string;
    /** Who makes it. */
    maker: string;
    disclosed: {
        /** Short caption for the meter screen. */
        label: string;
        /** What the published figures actually describe. */
        scope: string;
        gwpKgCo2e: number;
        waterL: number;
        adpeKgSbEq: number;
        /** Hardware the maker reports for this model's own training, if any. */
        trainingHardware?: string;
        sources: string[];
    } | null;
    /** What is and is not known, in a sentence. */
    note: string;
}

export const TRAINING_DISCLOSURES: TrainingDisclosure[] = [
    {
        model: "Mistral Large 3",
        maker: "Mistral AI",
        disclosed: {
            label: "Training Mistral Large 2 and its first 18 months — the closest published figure",
            scope: "Mistral Large 2 — training plus its first 18 months of use (to January 2025), including data centres and hardware manufacturing. The closest published figure: Mistral has not published a life-cycle analysis of Large 3.",
            gwpKgCo2e: 20_400_000,
            waterL: 281_000_000,
            adpeKgSbEq: 660,
            trainingHardware: "Large 3 was trained from scratch on 3,000 NVIDIA H200 GPUs (duration not published).",
            sources: [
                "https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai",
                "https://mistral.ai/news/mistral-3/",
            ],
        },
        note: "Large 3 has 675B parameters against Large 2's 123B, and Mistral found impacts roughly proportional to model size — so the true figure is likely larger.",
    },
    {
        model: "Gemini 2.5 Flash",
        maker: "Google",
        disclosed: null,
        note: "Google publishes per-prompt serving figures for Gemini, but nothing about training.",
    },
    {
        model: "Inworld TTS",
        maker: "Inworld AI",
        disclosed: null,
        note: "The TTS-1 technical report describes the models, not the energy, water or hardware used to train them.",
    },
    {
        model: "ElevenLabs Flash v2.5",
        maker: "ElevenLabs",
        disclosed: null,
        note: "Neither the model nor its training is described publicly.",
    },
    {
        model: "Soniox speech recognition",
        maker: "Soniox",
        disclosed: null,
        note: "Neither the model nor its training is described publicly.",
    },
];
