/**
 * Where the counting stops: what others have published about one AI answer, what nobody
 * counts or discloses, and where the hardware's minerals come from. Shown on the meter and the
 * methodology page next to our own EcoLogits estimate (docs/ai-footprint-meter.md).
 *
 * Every figure is as published; each source draws its boundary differently, which is the point.
 */

export interface PublishedCount {
    who: string;
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
        answer: "a median Gemini text prompt (2025)",
        counts: "the electricity of the chips, servers, idle machines and data centre, and the water evaporated to cool it",
        leavesOut: "the water used to generate the electricity, making the hardware, and training the model; emissions are counted after Google's clean-energy purchases",
        perAnswer: { energyWh: 0.24, waterMl: 0.26, co2eG: 0.03 },
        sources: ["https://arxiv.org/abs/2508.15734"],
    },
    {
        who: "Mistral AI",
        answer: "a 400-token answer from Mistral Large 2 (2025)",
        counts: "the electricity, the water used to cool the data centre and to generate its electricity, and making the hardware",
        leavesOut: "the visitor's own device; it publishes no energy figure",
        perAnswer: { waterMl: 45, co2eG: 1.14, mineralsMgSbEq: 0.16 },
        sources: ["https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai"],
    },
];

export interface OutsideItem {
    item: string;
    /** Not counted: no figure here includes it. Not published: the companies do not say. */
    why: "not counted" | "not published";
    /** What it is, and why the figures leave it out, for the methodology page. */
    note: string;
    /**
     * What one published study puts it at, relative to what the screen counts. Only where the
     * study measures what our figures leave out, so it says how far above them the truth lies.
     */
    estimate?: { figure: string; note: string; sources: string[] };
}

/**
 * What lies outside the meter's figures, in the order of the hardware's and the models' life:
 * before training, building and making, running each answer, and the afterlife. Training itself
 * has its own entry (training.ts).
 */
export const OUTSIDE_THE_NUMBERS: OutsideItem[] = [
    {
        item: "AI companies' own development",
        why: "not published",
        note: "The experiments, tuning and abandoned runs before a model's final training. Training figures, where they exist, cover only the final run.",
        estimate: {
            figure: "about +50% on training",
            note: "Morrison et al. (ICLR 2025) measured the development of AI2's open language models: the experiments and tuning before the final training run came to about half of that run's own impact. No company behind the council's models publishes this.",
            sources: ["https://arxiv.org/abs/2503.05804"],
        },
    },
    {
        item: "Building the data centres",
        why: "not counted",
        note: "The concrete, steel, cooling plants and grid connections of the buildings. EcoLogits counts a share of making the servers and GPUs, not the buildings they stand in.",
    },
    {
        item: "The water used to make the chips",
        why: "not counted",
        note: "Chip factories use large amounts of ultrapure water. EcoLogits counts the water for cooling and for electricity, but none for manufacturing.",
    },
    {
        item: "How large most of the models are",
        why: "not published",
        note: "EcoLogits estimates from a model's size. Of the council's models only Mistral publishes it; Gemini's size is EcoLogits' own estimate, and the voices' and listening models' sizes are our guesses.",
    },
    {
        item: "Where the answers are computed",
        why: "not published",
        note: "No provider says which data centre served a request. Each model below has an assumed country, from what its provider documents.",
    },
    {
        item: "Where the electricity really came from",
        why: "not published",
        note: "The figures use each country's average grid. The actual supply at that hour, and the companies' own energy contracts, are not published.",
    },
    {
        item: "Reading the question, before each answer",
        why: "not counted",
        note: "EcoLogits counts the time to write an answer, not to read what it is given. Here that is a lot: each reply reads the whole conversation so far.",
    },
    {
        item: "Internet infrastructure",
        why: "not counted",
        note: "The networks carrying each request between this room, the AI providers and their data centres.",
    },
    {
        item: "Data centres kept waiting for demand",
        why: "not counted",
        note: "Machines kept running idle so that capacity is there when requests arrive.",
        estimate: {
            figure: "about +10% energy",
            note: "In Google's measurement of a median Gemini prompt (2025), machines kept running idle, ready for demand, took 0.02 of its 0.24 Wh. EcoLogits counts the servers and the cooling, but not this idle capacity.",
            sources: ["https://arxiv.org/html/2508.15734"],
        },
    },
    {
        item: "The hardware's afterlife as e-waste",
        why: "not counted",
        note: "Servers and chips are replaced every few years as newer ones arrive; what happens to them, and to the toxic materials in them, is outside every figure.",
    },
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
