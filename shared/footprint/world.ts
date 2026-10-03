/**
 * The scale this screen's figures sit in: what AI's build-out costs around the world, and
 * near Boden, as published. Shown on the meter and, with sources, on the methodology page
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
        what: "Data centres' electricity, 2024",
        figure: "415 TWh, 1.5% of the world's",
        note: "The International Energy Agency's estimate for all data centres, AI and otherwise. It has grown by about 12% a year since 2017.",
        sources: ["https://www.iea.org/reports/energy-and-ai/executive-summary"],
    },
    {
        what: "Expected by 2030",
        figure: "945 TWh, more than double",
        note: "The IEA's base case, with AI as the main driver of the growth.",
        sources: ["https://www.iea.org/reports/energy-and-ai/executive-summary"],
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
    {
        what: "Stargate Norway, Narvik, planned by the end of 2026",
        figure: "100,000 GPUs, 230 MW",
        note: "OpenAI's first European data centre, built by Nscale and Aker at Kvandal outside Narvik, on hydropower; up to 520 MW over time. About 350 km from Boden.",
        sources: [
            "https://www.techcrunch.com/2025/07/31/openai-to-launch-ai-data-center-in-norway-its-first-in-europe",
            "https://www.arctictoday.com/stargate-norway-marks-turning-point-in-europes-ai-infrastructure-rac",
        ],
    },
    {
        what: "Forest felled for a Google data centre, Muhos, Finland",
        figure: "over 300 hectares",
        note: "Felled on land Google bought from the Finnish state forest agency, before the environmental impact assessment the regulator had called for; the regulator is investigating, and Google says the felling followed the Forest Act. About 230 km from Boden.",
        sources: [
            "https://www.helsinkitimes.fi/finland/finland-news/domestic/29292-finland-investigates-suspected-illegal-logging-at-google-data-centre-sites.html",
            "https://woodcentral.com.au/google-finland-data-centre-felling/",
        ],
    },
    {
        what: "Hive's Bitcoin mine in Boden, turned to AI",
        figure: "2,000 GPUs",
        note: "Hive Digital announced in 2025 that it would convert its Boden data centre from Bitcoin mining to liquid-cooled AI computing for customers in the EU, a nine-to-twelve-month retrofit.",
        sources: [
            "https://www.datacenterdynamics.com/en/news/hive-to-convert-sweden-facility-into-ai-cloud-data-center/",
            "https://boden.se/en/community-and-development/community-development/bodenxt/bodenxt-news/2025-10-13-data-center-makes-ai-push-in-boden",
        ],
    },
];
