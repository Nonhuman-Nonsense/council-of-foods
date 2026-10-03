/**
 * Where the counting stops: what others have published about one AI answer, what nobody
 * counts or discloses, and where the hardware's minerals come from. Shown on the meter and the
 * methodology page next to our own EcoLogits estimate (docs/ai-footprint-meter.md).
 *
 * Every figure is as published; each source draws its boundary differently, which is the point.
 */

export interface PublishedCount {
    who: string;
    /** In a few words, what its water figure includes — for the meter's comparison. */
    waterIncludes: string;
    /** What one answer means in this source. */
    answer: string;
    /** What the source counts, and what it leaves out. */
    counts: string;
    leavesOut: string;
    perAnswer: {
        energyWh?: number;
        waterMl?: number;
        co2eG?: number;
        mineralsMgSbEq?: number;
    };
    sources: string[];
}

/** Others' published figures for one answer. Our own EcoLogits figure is computed next to them. */
export const PUBLISHED_COUNTS: PublishedCount[] = [
    {
        who: "Google",
        waterIncludes: "cooling only",
        answer: "a median Gemini text prompt (2025)",
        counts: "the electricity of the chips, servers, idle machines and data centre, and the water evaporated to cool it",
        leavesOut: "the water used to generate the electricity, making the hardware, and training the model; emissions are counted after Google's clean-energy purchases",
        perAnswer: { energyWh: 0.24, waterMl: 0.26, co2eG: 0.03 },
        sources: ["https://arxiv.org/abs/2508.15734"],
    },
    {
        who: "Mistral AI",
        waterIncludes: "cooling, power stations and making the hardware",
        answer: "a 400-token answer from Mistral Large 2 (2025)",
        counts: "the electricity, the water used to cool the data centre and to generate its electricity, and making the hardware",
        leavesOut: "the visitor's own device; it publishes no energy figure",
        perAnswer: { waterMl: 45, co2eG: 1.14, mineralsMgSbEq: 0.16 },
        sources: ["https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai"],
    },
];

/** Costs no figure on the meter includes. */
export const NOT_COUNTED: string[] = [
    "Training the models, except Mistral's own published figure",
    "The water used to make the chips",
    "Reading: the text each answer is based on",
    "The networks between this room and the data centres",
    "Data centres kept waiting for demand",
    "The hardware's afterlife as e-waste",
];

/** What the companies running the models do not say. */
export const NOT_DISCLOSED: string[] = [
    "How large most of the models are",
    "Where the answers are computed",
    "What training cost, for every model but Mistral's",
];

export interface MineralPlace {
    mineral: string;
    place: string;
    /** What it is in AI hardware. */
    use: string;
    /** What is documented about the place. */
    note: string;
    sources: string[];
}

/**
 * Where minerals in AI hardware are mined. Nobody can trace which mine supplied which chip;
 * these are documented places in the supply of each mineral, not a claim about our hardware.
 */
export const MINERAL_PLACES: MineralPlace[] = [
    {
        mineral: "Tantalum",
        place: "Rubaya, North Kivu, DR Congo",
        use: "the capacitors that steady the power on every GPU board",
        note: "About 15% of the world's tantalum ore. Held by the M23 armed group since April 2024, which UN experts report taxes and smuggles the ore; a collapse at the mine in January 2026 killed more than 200 people.",
        sources: [
            "https://www.argusmedia.com/en/news-and-insights/market-opinion-and-analysis-blog/rubaya-mine-collapse-tantalum-supply-chain",
            "https://www.swissinfo.ch/eng/international-geneva/un-experts-warn-congos-conflict-minerals-slipping-into-global-market/89978793",
            "https://www.aljazeera.com/news/2026/1/31/more-than-200-killed-in-mine-collapse-in-eastern-dr-congo-report",
        ],
    },
    {
        mineral: "Cobalt",
        place: "Kolwezi, Lualaba, DR Congo",
        use: "the wiring inside chips and the backup batteries of data centres",
        note: "The DR Congo mines about three quarters of the world's cobalt. Amnesty International documented children working in artisanal cobalt mines around Kolwezi.",
        sources: [
            "https://ourworldindata.org/data-insights/most-of-the-worlds-cobalt-is-mined-in-the-democratic-republic-of-congo-but-refined-in-china",
            "https://www.amnesty.org/en/latest/campaigns/2016/06/drc-cobalt-child-labour/",
        ],
    },
    {
        mineral: "Gallium",
        place: "China",
        use: "the power electronics that feed the servers",
        note: "99% of the world's primary gallium is produced in China, mostly as a by-product of refining aluminium.",
        sources: ["https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-gallium.pdf"],
    },
    {
        mineral: "Copper",
        place: "Escondida, Atacama Desert, Chile",
        use: "every chip, circuit board, server and cable",
        note: "The world's largest copper mine pumped fresh water from the Monturaqui-Negrillar-Tilopozo aquifer for two decades; the Atacameño community of Peine sued the mine in 2022 over the damage to its wetlands and way of life.",
        sources: [
            "https://en.wikipedia.org/wiki/Monturaqui-Negrillar-Tilopozo_Aquifer",
            "https://news.mongabay.com/2024/10/chilean-indigenous-association-participates-in-key-study-for-lawsuit-against-mining/",
        ],
    },
];
