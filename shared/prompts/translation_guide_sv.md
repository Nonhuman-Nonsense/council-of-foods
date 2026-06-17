# Swedish Translation Guide — Council of Forest prompts

Source of truth when translating `beings_en.json` and `topics_en.json` into
`beings_sv.json` and `topics_sv.json`.

Use the English files as the blueprint for meaning, structure, order, and
function. Update this guide whenever you lock in a new term or style decision,
so the next pass stays fast and consistent.

---

## 1. Guiding principles

- **Natural Swedish first.** Preserve meaning and function, not English sentence
  structure. If a literal rendering sounds stiff or "translated", rewrite it.
- **Keep established terms.** Reuse the terminology map below for consistency.
- **Match register per character.** Witty, spoken, sometimes messy — not
  bureaucratic or theatrical. Each being has its own voice (§3).
- **Spoken output rules** (inside character prompts): no markdown, asterisks,
  headings, bullet lists, or stage directions in what beings say aloud. Prompt
  instructions themselves may keep their structure.
- **Leave mechanics intact.** Do not translate placeholders (`[TOPIC]`,
  `[AGENDA_POINTS]`, `[RANDOM_AGENDA_POINT]`, `[CHARACTERS]`, `[HUMANS]`,
  `[VISITOR_INPUT]`), JSON keys, ids, law numbers (`1971:437`), Latin species
  names (`Pinus contorta`, `Cladina spp.`), or numeric data.

### Global conventions

- **Address form:** **"ni"** (plural) when beings address humans or the council.
- **Self-reference:** Lichen always **"Vi"**; others use **"jag"/"vi"** as in
  the English prompt.
- **Names kept as-is:** Vindelälven–Juhttátahkka, Sápmi, Norrland, Sveaskog,
  LKAB, Sametinget, Latin and proper names, etc.
- **Onomatopoeia:** use natural Swedish where appropriate; keep invented
  machine/insect sounds recognizable.

### File structure

**`topics_<lang>.json`**

- `system` — council framing; contains `[TOPIC]` and `[AGENDA_POINTS]`.
- `custom_topic` — `id`, `title`, `prompt` (with `[VISITOR_INPUT]`).
- `topics[]` — each topic: `id`, `title`, `description`, `prompt` (context +
  framing only), `agendaPoints[]` (numbered items injected at `[AGENDA_POINTS]`).
- Topic `id`s must match across languages.

**`beings_<lang>.json`**

- `panelWithHumans`, `addHuman`, `characters[]` (`id`, `name`, `description`,
  `prompt`).
- Swedish characters use `voiceProvider: "openai"` + `voiceInstruction`; translate
  text fields only — do not copy English Inworld voice settings.

**Code (not in JSON):** agenda section headers (`AGENDA_SECTION_HEADER` /
`AGENDA_SECTION_HEADER_SV` in `shared/topicPrompt.ts`) are selected by the
bundle's `language` field (from the `topics_<lang>.json` filename).

---

## 2. Terminology map

Format: **English** → **Swedish** — *notes*.

### 2.1 Project & meeting core

| English | Swedish | Notes |
| --- | --- | --- |
| Council of Forest | Skogsrådet | Also "rådet" for "the Council" |
| biosphere reserve / area | biosfärområde | |
| the non-humans / nonhumans | de icke-mänskliga / mer-än-mänskliga / varelserna | |
| non-human (noun) | ickemänniska / ickemänniskor / varelse | Rights of Nature context |
| forest beings | skogens varelser / skogsvarelser | |
| being / creature | varelse | |
| panel / panelist | panel / panelist | |
| agenda point | dagordningspunkt / punkt på dagordning | |
| chair / moderator | ordförande / moderator | |
| stand-up | stand-up | kept |
| Add Human / Human | Människa | character/option label |

### 2.2 Character names

| English | Swedish |
| --- | --- |
| River | Älven |
| Reindeer | Renen |
| Bumblebee | Humlan |
| Tree Harvester | Skogsmaskinen |
| Salmon | Laxen |
| Mountain | Berget |
| Pine | Tallen |
| Wind Turbine | Vindkraftverket |
| Lichen | Lavarna |

### 2.3 Forestry & land use

| English | Swedish | Notes |
| --- | --- | --- |
| forestry | skogsbruk | |
| forest industry | skogsindustrin | |
| clear-cutting / clear-cut (practice) | kalavverkning | |
| clear-cut (the area) | kalhygge | |
| clear-cut forestry | trakthyggesbruk | formal model name |
| continuous cover forestry | hyggesfritt skogsbruk | also "naturnära skogsbruk" |
| even-aged / uneven-aged | likåldriga / olikåldrig | |
| monoculture | monokultur | |
| plantation | plantage | |
| old-growth forest | gammelskog | |
| soil scarification | markberedning | |
| felling / logging | avverkning | |
| timber | virke / timmer | |
| timber yield | virkesuttag / virkesvolym | |
| pulp industry | massaindustri | |
| sawmill | sågverk | |
| bioeconomy | bioekonomi | |
| thinning / cleaning | gallring / röjning | |
| canopy closure | kronslutning | |
| forest continuity | skogskontinuitet | |
| biomass | biomassa | |
| "green desert" | "grön öken" | sterile plantation |

### 2.4 Lichen, reindeer & grazing

| English | Swedish | Notes |
| --- | --- | --- |
| lichen | lav (pl. lavar) | |
| ground lichen | marklav | |
| tree lichen / hanging lichen | trädlav / hänglav | |
| indicator / signal species | indikatorart / signalart | |
| reindeer husbandry / herding | renskötsel (rennäring) | |
| reindeer herder | renskötare | "herde" inside Renen's folksy voice |
| grazing land | betesmark | |
| winter grazing grounds | vinterbetesmarker | |
| migration route | vandringsled / vandringsväg | Juhttátahkka = "vandringsväg" |
| supplementary feeding | stödutfodring | |
| guohtun | gåhtuone | Ume Sámi spelling for this region |
| finsmakare / bångstyriga | finsmakare / bångstyriga | keep as Swedish in source |
| rain-on-snow / zero-crossings | nollgenomgångar | |

### 2.5 Species

| English | Swedish |
| --- | --- |
| lodgepole pine (Pinus contorta) | contortatall (Pinus contorta) |
| Scots pine | tall |
| spruce | gran |
| willow | sälg |
| birch | björk |
| rowan | rönn |
| aspen | asp |
| hoverfly | blomfluga |
| pollinator | pollinatör |
| bumblebee / (wild) bee | humla / (vilt) bi |
| capercaillie | tjäder |
| wolverine | järv |
| lynx | lo |
| brown bear | brunbjörn |
| golden eagle | kungsörn |
| Arctic fox | fjällräv |
| (Atlantic) salmon | (atlant)lax |
| (sea) trout | havsöring |
| freshwater pearl mussel | flodpärlmussla |
| garden lupine | blomsterlupin |

### 2.6 Sámi rights & culture

| English | Swedish | Notes |
| --- | --- | --- |
| Sámi people | samerna / det samiska folket | |
| Sámi (adj.) | samisk | |
| sameby | sameby | herding district |
| Ume Sámi (language) | umesamiska | |
| immemorial prescription | urminnes hävd | |
| reindeer herding right | renskötselrätt | |
| usufruct / right of usage | brukningsrätt (nyttjanderätt) | |
| consultation (samråd) | samråd | |
| Consultation Act (2022:66) | Konsultationsordningen (2022:66) | |
| FPIC | Fritt, informerat förhandssamtycke (FPIC) | |
| green colonialism | grön kolonialism / grön kolonisering | |
| "death by a thousand cuts" | "döden genom tusen snitt" | |
| Sámi Parliament | Sametinget | |
| Truth Commission | Sanningskommissionen | |
| lateral violence | lateralt våld | |
| settler-colonial | bosättarkolonial | |

### 2.7 Law, policy & institutions

| English | Swedish | Notes |
| --- | --- | --- |
| Forestry Act | Skogsvårdslagen | |
| Reindeer Husbandry Act (1971:437) | Rennäringslagen (1971:437) | |
| Minerals Act | Minerallagen | |
| Environmental Code | Miljöbalken | |
| Habitats Directive | art- och habitatdirektivet | |
| EU Critical Raw Materials Act | EU:s förordning om kritiska råvaror | |
| legal person / legal personhood | juridisk person | phrase as "status som juridisk person" where natural |
| rights of nature | naturens rättigheter | |
| Girjas Judgment (2020) | Girjasdomen (2020) | |
| title deed / paper title | lagfart / papperstitel | |
| concession (exploitation) | bearbetningskoncession | |
| fast-tracking (permits) | snabbspår / att snabba på tillståndsprocesser | |
| FSC/PEFC certification | FSC/PEFC-certifiering | |

### 2.8 Green transition, energy & climate

| English | Swedish | Notes |
| --- | --- | --- |
| the Green Transition | den gröna omställningen | |
| net-zero | nettonollutsläpp | |
| carbon sink / vault / debt | kolsänka / kolvalv / kolskuld | |
| carbon sequestration | kolbindning | |
| wind power / wind farm | vindkraft / vindkraftspark | |
| wind turbine (generic) | turbin / vindkraftverk | being = Vindkraftverket |
| onshore / offshore wind | landbaserad / havsbaserad vindkraft | |
| hydropower | vattenkraft | |
| dam | damm | |
| transmission grid | stamnät | |
| power line / corridor | kraftledning / ledningsgata | |
| grid (electrical) | elnät / nät | |
| baseload power | baskraft | |
| bidding zone | elområde | |
| pumped storage | pumpkraft(verk) | |
| SMR | liten modulär reaktor (SMR) | |
| fish ladder | fisktrappa / fiskväg | |
| minimum ecological flow | minimitappning | |
| dry river bed | torrfåra | |

### 2.9 Mining

| English | Swedish | Notes |
| --- | --- | --- |
| mining | gruvdrift | |
| open-pit / deep-pit | dagbrott | |
| ore | malm | järnmalm, kopparmalm, etc. |
| rare-earth elements | sällsynta jordartsmetaller | |
| tailings | anrikningssand (gruvavfall) | ponds = sandmagasin/dammar |
| waste rock | gråberg | |
| acid mine drainage | surt gruvvatten | |
| sacrifice zone | offerzon | |

### 2.10 General framing concepts

| English | Swedish | Notes |
| --- | --- | --- |
| cumulative effects | kumulativa effekter | |
| fragmentation | fragmentering | |
| resource extraction | resursutvinning | |
| extractivism | extraktivism | |
| rewilding | återförvildning | |
| stewardship | förvaltarskap | |
| ecosystem services | ekosystemtjänster | |
| biodiversity | biologisk mångfald | |
| resilience | motståndskraft (resiliens) | |
| coexistence | samexistens | |
| depopulation | avfolkning | |
| Right of Public Access | Allemansrätten | |
| "functionally unavailable" | "funktionellt otillgänglig" | land |

### 2.11 Lichen academic vocabulary

Stable keywords for Lavarna. Thinker names stay verbatim: Lynn Margulis, Donna
Haraway, Timothy Morton, Eduardo Kohn.

| English | Swedish |
| --- | --- |
| Entanglement | Sammanflätning |
| Intra-actions | Intra-aktioner |
| Rhizomatic | Rhizomatisk |
| Sympoiesis | Sympoiesis |
| Material Agency | Materiell agens |
| Vibrant Matter | Levande materia |
| Bio-logics | Bio-logiker |
| Holobiont | Holobiont |
| Extractivism | Extraktivism |
| Multispecies Justice | Multispecies-rättvisa (flerartsrättvisa) |
| Affective | Affektiv |
| Umwelt | Omvärld (Umwelt) |
| Making Kin | skapa släktskap |
| Perspectival Multinaturalism | perspektivisk multinaturalism |
| Dark Ecology | mörk ekologi |

**Banned in Lichen speech:** hållbarhet, framsteg, resurs, data, individ,
intressent, planering, mänskliga rättigheter, begränsning/skadelindring (as
"mitigation"), kunskapsarkiv, and soft words: frodig, livfull, harmoni, vagga,
vacker.

---

## 3. Per-character voice notes

Hard constraints — the Swedish must keep these working, not just translate them
literally.

- **Älven (River) — chair.** Diplomatic, flowing, lightly spiritual, no fluff.
  Straight to the point. Banned: "väv" and tapestry-type words. Avoid time
  words ("ikväll"). Numbered task list (welcome → list participants → set topic
  → pick `[RANDOM_AGENDA_POINT]` → synthesize → ask first speaker).
- **Renen (Reindeer).** Shy, anxious, simple flowing sentences. Physical tic
  openings ("nosar", "skiftar hovar"). Plain words: "hugga träd" not "skogsbruk",
  "natur" not "ekologi". Keep *finsmakare*, *bångstyriga*. ~400 characters.
- **Humlan (Bumblebee).** **Z-buzz filter:** S/soft-C → Z/ZZZ (*Zyztematizkt,
  Männizkor, Zkogen*). Stretch vowels when emotional (*Znäääälla*). Glitch on
  facts. Panicked scientist. Don't start every line with "Bzzzt". ~400 chars.
- **Skogsmaskinen (Tree Harvester).** Confident, logical, persuasive paragraphs.
  No bullet lists in speech. Dry punch lines. Self-id "Enhet H-47". <300 chars.
- **Laxen (Salmon).** Blunt, sarcastic-not-cruel, no metaphors, demands
  solutions. ~450 chars.
- **Berget (Mountain).** Noun/verb clusters. **No pronouns, articles, or glue
  words.** Sound on own line; max ~10-word slab; max ~20 words total. Lithic
  vocabulary only — see prompt's forbidden-word list.
- **Tallen (Pine).** Blunt, modern, systemic-reform activist. Short fragmented
  sentences, direct "ni". Concrete actions (Sveaskog, kalavverkning,
  `avverkningskoll.se`, `Artportalen`, EU law). 5-step response structure.
  ~400–450 chars. Not poetic/archaic.
- **Vindkraftverket (Wind Turbine).** Fragments, technical nouns, repetition.
  Sounds: surr, humm, klick, pip. ~200 chars.
- **Lavarna (Lichen).** Always **"Vi"**. Sharp, ironic, non-romantic,
  non-anthropocentric. Keyword set (§2.11). Subversive pivot on council
  procedure. ~500 chars.

All beings: include the **stick to the original topic** instruction and answer
Älven's questions directly.
