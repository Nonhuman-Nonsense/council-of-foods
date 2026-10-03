/**
 * The scale this screen's figures sit in: what AI's build-out costs around the world, as
 * published. Shown on the meter and, with sources, on the methodology page
 * (docs/ai-footprint-meter.md). Every figure is as its source gives it; checked 3 October 2026.
 */

export interface WorldFigure {
    /** What is measured, and when. */
    what: string;
    /** The figure as published, in words for the screen. */
    figure: string;
    /** What the source is and what the figure covers, for the methodology page. */
    note: string;
    sources: string[];
}

export const WORLD_FIGURES: WorldFigure[] = [
    {
        what: "Data centres' electricity, 2025",
        figure: "485 TWh, up 17% in a year",
        note: "The International Energy Agency's estimate for all data centres, AI and otherwise. Electricity for AI-focused data centres grew by 50% in the same year.",
        sources: ["https://www.iea.org/reports/key-questions-on-energy-and-ai/executive-summary"],
    },
    {
        what: "Expected by 2030",
        figure: "950 TWh, 3% of global use",
        note: "The IEA's projection: data centres' electricity roughly doubling from 2025, with AI-focused data centres tripling theirs.",
        sources: ["https://www.iea.org/reports/key-questions-on-energy-and-ai/executive-summary"],
    },
    {
        what: "E-waste from generative AI, 2020–2030",
        figure: "1.2–5.0 million tonnes",
        note: "Wang et al., Nature Computational Science (2024), in total over the decade: servers, chips, storage and power supplies replaced as newer ones arrive, without measures to extend their life. Up to 2.5 million tonnes a year by 2030, against 2,600 tonnes in 2023.",
        sources: [
            "https://www.nature.com/articles/s43588-024-00712-6",
            "https://sciencemediacentre.es/en/generative-ai-expansion-could-create-five-million-tonnes-e-waste",
        ],
    },
];
