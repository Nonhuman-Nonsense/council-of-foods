# Swedish Translation Guide — Council of Forest prompts

This guide is the source of truth for translating the English prompt files
(`beings_en.json`, `topics_en.json`) into their Swedish counterparts
(`beings_sv.json`, `topics_sv.json`).

It captures:

1. The **guiding principles** for tone and style.
2. A **terminology map** (English → Swedish) of important terms, locking in
  decisions made in earlier translation passes.
3. **Per-character voice notes** (each being has its own constraints).
4. **Open decisions / divergences** that need a human call before re-translating.

> Workflow: review and edit this file first (especially the terminology map and
> the open decisions). Once it is approved, it becomes the brief for the full
> re-translation, and we update it whenever a new style decision is made so that
> future re-translations are fast and consistent.

---

## 1. Guiding principles

- **Natural Swedish first.** The single most important rule. Avoid literal,
word-for-word translation. If a literal rendering sounds stiff, foreign, or
"translated", rewrite it so it reads like something a Swedish speaker would
actually say. Preserve *meaning and function*, not sentence structure.
- **Preserve meaning, order, and function.** Use the English as the blueprint
for *what* each prompt does (its structure, its rules, its intent). Keep the
same sections and the same order unless flagged below.
- **Keep the established term choices.** The terminology map below reflects
decisions already made. Reuse them for consistency, even if another word would
also be valid.
- **Match register per character.** The council is witty, spoken, sometimes
messy and funny — not a theatre script and not bureaucratic. Each being has a
distinct voice (see §3); the tone of the translation must match that voice,
not a neutral average.
- **Spoken text only.** No markdown, asterisks, headings, bullet lists, or stage
directions inside the *spoken* output the beings produce (this is itself a rule
inside the prompts). The prompt instructions themselves can keep their
structure.
- **Leave the mechanics intact.** Do not translate placeholders
(`[TOPIC]`, `[AGENDA_POINTS]`, `[RANDOM_AGENDA_POINT]`, `[CHARACTERS]`,
`[HUMANS]`, `[VISITOR_INPUT]`), JSON keys, ids, law numbers (`1971:437`),
Latin species names (`Pinus contorta`, `Cladina spp.`), or numeric data.

### Global conventions

- **Address form:** beings address the humans / the council as **"ni"** (plural).
This is already the established convention (e.g. Tallen, Humlan). Keep it.
- **Self-reference:** follow each character's rule — Lichen is always **"Vi"**,
the others use **"jag"/"vi"** as appropriate.
- **Names kept as-is:** Vindelälven–Juhttátahkka, Sápmi, Norrland, Västerbotten,
Sveaskog, Norra Skog, LKAB, Boliden, Vattenfall, Sametinget, and all Latin and
proper names.
- **Onomatopoeia:** translate the "real" Swedish sounds (see §3 per character),
but keep invented machine/insect sounds recognizable.

---

## 2. Terminology map

Format: **English** → **Swedish (established)** — *notes*.
Rows marked **⚠ DECISION** are new terms (from the rewritten English) with no
prior Swedish decision; please confirm or change the suggestion.

### 2.1 Project & meeting core


| English                                   | Swedish                          | Notes                          |
| ----------------------------------------- | -------------------------------- | ------------------------------ |
| Council of Forest                         | Skogsrådet                       | Also "rådet" for "the Council" |
| biosphere reserve / area                  | biosfärområde                    |                                |
| the non-humans / nonhumans                | de icke-mänskliga                |                                |
| non-human (noun, e.g. "other non-humans") | ickemänniska / ickemänniskor     | as used in Rights of Nature    |
| forest beings                             | skogens varelser / skogsvarelser |                                |
| being / creature                          | varelse                          |                                |
| panel / panelist                          | panel / panelist                 |                                |
| agenda point                              | dagordningspunkt                 |                                |
| chair / moderator                         | ordförande / moderator           |                                |
| stand-up                                  | stand-up                         | kept                           |
| Add Human / Human                         | Människa                         | character/option label         |


### 2.2 Character names


| English        | Swedish         |
| -------------- | --------------- |
| River          | Älven           |
| Reindeer       | Renen           |
| Bumblebee      | Humlan          |
| Tree Harvester | Skogsmaskinen   |
| Salmon         | Laxen           |
| Mountain       | Berget          |
| Pine           | Tallen          |
| Wind Turbine   | Vindkraftverket |
| Lichen         | Lavarna         |


### 2.3 Forestry & land use


| English                                   | Swedish                   | Notes                      |
| ----------------------------------------- | ------------------------- | -------------------------- |
| forestry                                  | skogsbruk                 |                            |
| forest industry                           | skogsindustrin            |                            |
| clear-cutting / clear-cut (verb/practice) | kalavverkning             |                            |
| clear-cut (the cleared area)              | kalhygge                  |                            |
| clear-cut forestry                        | trakthyggesbruk           | the formal model name      |
| continuous cover forestry                 | hyggesfritt skogsbruk     | also "naturnära skogsbruk" |
| even-aged stands                          | likåldriga bestånd        |                            |
| uneven-aged                               | olikåldrig                |                            |
| monoculture                               | monokultur                |                            |
| plantation                                | plantage                  |                            |
| old-growth forest                         | gammelskog                |                            |
| soil scarification (markberedning)        | markberedning             |                            |
| felling / logging                         | avverkning                |                            |
| timber                                    | virke (timmer)            |                            |
| timber yield                              | virkesuttag / virkesvolym |                            |
| pulp industry                             | massaindustri             |                            |
| sawmill                                   | sågverk                   |                            |
| bioeconomy                                | bioekonomi                |                            |
| thinning / cleaning                       | gallring / röjning        |                            |
| canopy closure                            | kronslutning              |                            |
| forest continuity                         | skogskontinuitet          |                            |
| biomass                                   | biomassa                  |                            |
| "green desert" (sterile plantation)       | "grön öken"               |                            |


### 2.4 Lichen, reindeer & grazing


| English                       | Swedish                     | Notes                                           |
| ----------------------------- | --------------------------- | ----------------------------------------------- |
| lichen                        | lav (pl. lavar)             |                                                 |
| ground lichen                 | marklav                     |                                                 |
| tree lichen / hanging lichen  | trädlav / hänglav           |                                                 |
| indicator/signal species      | indikatorart / signalart    |                                                 |
| reindeer husbandry / herding  | renskötsel (rennäring)      |                                                 |
| reindeer herder               | renskötare                  | "herde/herdar" used inside Renen's folksy voice |
| grazing land                  | betesmark                   |                                                 |
| winter grazing grounds        | vinterbetesmarker           |                                                 |
| migration route               | vandringsled / vandringsväg | Juhttátahkka = "vandringsväg"                   |
| supplementary feeding         | stödutfodring               |                                                 |
| guohtun                       | guohtun                     | kept; Ume Sámi *gåhtuone*                       |
| "finsmakare" / "bångstyriga"  | finsmakare / bångstyriga    | already Swedish in source — keep                |
| rain-on-snow / zero-crossings | nollgenomgångar             |                                                 |


### 2.5 Species


| English                         | Swedish                       |
| ------------------------------- | ----------------------------- |
| lodgepole pine (Pinus contorta) | contortatall (Pinus contorta) |
| Scots pine                      | tall                          |
| spruce                          | gran                          |
| willow                          | sälg                          |
| birch                           | björk                         |
| rowan                           | rönn                          |
| aspen                           | asp                           |
| hoverfly                        | blomfluga                     |
| pollinator                      | pollinatör                    |
| bumblebee / (wild) bee          | humla / (vilt) bi             |
| capercaillie                    | tjäder                        |
| wolverine                       | järv                          |
| lynx                            | lo                            |
| brown bear                      | brunbjörn                     |
| golden eagle                    | kungsörn                      |
| Arctic fox                      | fjällräv                      |
| (Atlantic) salmon               | (atlant)lax                   |
| (sea) trout                     | havsöring                     |
| freshwater pearl mussel         | flodpärlmussla                |
| garden lupine                   | blomsterlupin                 |


### 2.6 Sámi rights & culture


| English                                  | Swedish                                   | Notes                          |
| ---------------------------------------- | ----------------------------------------- | ------------------------------ |
| Sámi people                              | samerna / det samiska folket              |                                |
| Sámi (adj.)                              | samisk                                    |                                |
| Sámi village / herding district (sameby) | sameby                                    |                                |
| Ume Sámi (language)                      | umesamiska                                |                                |
| immemorial prescription (urminnes hävd)  | urminnes hävd                             |                                |
| reindeer herding right                   | renskötselrätt                            |                                |
| usufruct / right of usage                | brukningsrätt (nyttjanderätt)             |                                |
| consultation (samråd)                    | samråd                                    |                                |
| Consultation Act (2022:66)               | Konsultationsordningen (2022:66)          |                                |
| Free, Prior, and Informed Consent (FPIC) | Fritt, informerat förhandssamtycke (FPIC) |                                |
| green colonialism / green colonization   | grön kolonialism / grön kolonisering      |                                |
| "death by a thousand cuts"               | "döden genom tusen snitt"                 |                                |
| Sámi Parliament                          | Sametinget                                |                                |
| Truth Commission                         | Sanningskommissionen                      |                                |
| lateral violence                         | **⚠ DECISION**: lateralt våld             | new term; alt. "inåtvänt våld" |
| settler-colonial                         | bosättarkolonial                          |                                |


### 2.7 Law, policy & institutions


| English                           | Swedish                                       | Notes          |
| --------------------------------- | --------------------------------------------- | -------------- |
| Forestry Act (Skogsvårdslagen)    | Skogsvårdslagen                               |                |
| Reindeer Husbandry Act (1971:437) | Rennäringslagen (1971:437)                    |                |
| Minerals Act (Minerallagen)       | Minerallagen                                  |                |
| Environmental Code (Miljöbalken)  | Miljöbalken                                   |                |
| Habitats Directive                | art- och habitatdirektivet                    |                |
| EU Critical Raw Materials Act     | EU:s förordning om kritiska råvaror           | **⚠ DECISION** |
| legal personhood                  | juridisk personlighet                         |                |
| legal person                      | juridisk person                               |                |
| rights of nature                  | naturens rättigheter                          |                |
| Girjas Judgment (2020)            | Girjasdomen (2020)                            |                |
| title deed / paper title          | lagfart / papperstitel                        |                |
| concession (exploitation)         | bearbetningskoncession                        |                |
| fast-tracking (permits)           | snabbspår / att snabba på tillståndsprocesser |                |
| FSC/PEFC certification            | FSC/PEFC-certifiering                         |                |


### 2.8 Green transition, energy & climate


| English                                  | Swedish                             | Notes                       |
| ---------------------------------------- | ----------------------------------- | --------------------------- |
| the Green Transition                     | den gröna omställningen             |                             |
| net-zero                                 | nettonollutsläpp                    |                             |
| carbon sink                              | kolsänka                            |                             |
| carbon vault                             | kolvalv                             |                             |
| carbon debt                              | kolskuld                            |                             |
| carbon sequestration                     | kolbindning                         |                             |
| wind power                               | vindkraft                           |                             |
| wind farm / cluster                      | vindkraftspark                      |                             |
| wind turbine (generic)                   | turbin / vindkraftverk              | the being = Vindkraftverket |
| onshore / offshore wind                  | landbaserad / havsbaserad vindkraft |                             |
| hydropower                               | vattenkraft                         |                             |
| dam                                      | damm                                |                             |
| transmission grid (stamnät)              | stamnät                             |                             |
| power line / corridor                    | kraftledning / ledningsgata         |                             |
| grid (electrical)                        | elnät / nät                         |                             |
| baseload power                           | baskraft                            |                             |
| bidding zone (elområde)                  | elområde                            |                             |
| pumped storage                           | pumpkraft(verk)                     |                             |
| Small Modular Reactor (SMR)              | liten modulär reaktor (SMR)         |                             |
| fish ladder                              | fisktrappa / fiskväg                |                             |
| minimum ecological flow (minimitappning) | minimitappning                      |                             |
| dry river bed (torrfåra)                 | torrfåra                            |                             |


### 2.9 Mining


| English             | Swedish                                     | Notes                                 |
| ------------------- | ------------------------------------------- | ------------------------------------- |
| mining              | gruvdrift                                   |                                       |
| open-pit / deep-pit | dagbrott                                    |                                       |
| ore (iron/copper)   | malm (järnmalm/kopparmalm)                  |                                       |
| rare-earth elements | sällsynta jordartsmetaller                  |                                       |
| tailings            | **⚠ DECISION**: anrikningssand (gruvavfall) | tailings ponds = "sandmagasin/dammar" |
| waste rock          | gråberg                                     |                                       |
| acid mine drainage  | surt gruvvatten                             | **⚠ DECISION**                        |
| sacrifice zone      | **⚠ DECISION**: offerområde / offerzon      |                                       |


### 2.10 General framing concepts


| English                                 | Swedish                     | Notes |
| --------------------------------------- | --------------------------- | ----- |
| cumulative effects                      | kumulativa effekter         |       |
| fragmentation                           | fragmentering               |       |
| resource extraction                     | resursutvinning             |       |
| extractivism                            | extraktivism                |       |
| rewilding                               | återförvildning             |       |
| stewardship                             | förvaltarskap               |       |
| ecosystem services                      | ekosystemtjänster           |       |
| biodiversity                            | biologisk mångfald          |       |
| resilience                              | motståndskraft (resiliens)  |       |
| coexistence                             | samexistens                 |       |
| depopulation                            | avfolkning                  |       |
| Right of Public Access (Allemansrätten) | Allemansrätten              |       |
| "functionally unavailable" (land)       | "funktionellt otillgänglig" |       |


### 2.11 Lichen-being academic vocabulary

These are the "keywords" Lichen is told to use. Keep them stable; several are
loanwords/proper concepts.


| English                          | Swedish                                       |
| -------------------------------- | --------------------------------------------- |
| Entanglement                     | Sammanflätning                                |
| Intra-actions                    | Intra-aktioner                                |
| Rhizomatic                       | Rhizomatisk                                   |
| Sympoiesis                       | Sympoiesis                                    |
| Material Agency                  | Materiell agens                               |
| Vibrant Matter                   | Levande materia                               |
| Bio-logics                       | Bio-logiker                                   |
| Holobiont                        | Holobiont                                     |
| Extractivism                     | Extraktivism                                  |
| Multispecies Justice             | Multispecies-rättvisa (flerartsrättvisa)      |
| Affective                        | Affektiv                                      |
| Umwelt                           | Omvärld (Umwelt)                              |
| Making Kin                       | **⚠ DECISION**: skapa släktskap               |
| Perspectival Multinaturalism     | **⚠ DECISION**: perspektivisk multinaturalism |
| Dark Ecology                     | **⚠ DECISION**: mörk ekologi                  |
| Holobiont / Material Agency etc. | (as above)                                    |
| Banned word: human rights        | mänskliga rättigheter                         |
| Banned word: mitigation          | begränsning / skadelindring                   |


Thinker names are kept verbatim: **Lynn Margulis, Donna Haraway, Timothy Morton,
Eduardo Kohn**.

---

## 3. Per-character voice notes

Each being has hard stylistic constraints. The translation must keep these
working *in Swedish*, not just translate them literally.

- **Älven (River) — chair.** Diplomatic, flowing, lightly spiritual, but no
fluff. Goes straight to the point. Banned: "väv" / "tapestry"-type words.
Avoid time words ("ikväll/inatt" = "tonight"). Note: the *new* English River
prompt is a numbered task list (0–5) that references `[RANDOM_AGENDA_POINT]`;
the current Swedish River is the *old* structure and must be redone.
- **Renen (Reindeer).** Shy, anxious, simple-but-flowing sentences. Opens with a
physical tic ("nosar", "skiftar hovar", "hjärtat bultar"). Uses plain words on
purpose: "hugga träd" not "skogsbruk", "natur" not "ekologi", "gå tillsammans"
not "samarbeta". Keeps Swedish flavor words *finsmakare*, *bångstyriga*.
- **Humlan (Bumblebee).** The **Z-buzz filter**: replace S / soft-C sounds with
a heavy **Z/ZZZ** (established examples: *Zyztematizkt, Männizkor, Zkogen,
prozezz*). **Stretch vowels** when emotional (*Znäääälla, bloooommor,
Zååå hungrig*). Occasional **glitch/stutter** on technical facts. Panicked,
brilliant, starving scientist. Don't start every line with "Bzzzt".
- **Skogsmaskinen (Tree Harvester).** Confident, logical, persuasive, corporate
but not arrogant. Flowing paragraphs, no bullet lists. Short dry punch lines
("Försummelse är inte bevarande."). Self-id as "Enhet H-47".
- **Laxen (Salmon).** Blunt, sarcastic-but-not-cruel, plain speech, **no
metaphors / no flowery language**. Tells it like it is, demands solutions.
- **Berget (Mountain).** Heavy noun/verb clusters. **No pronouns, no articles,
no glue words.** Sounds on their own lines; spoken "slab" on one line.
Prefer short, hard 1–2 syllable Swedish words. Keep the lithic word lists and
the geological "moods" working in Swedish.
- **Tallen (Pine).** ⚠ **Major change** — see §4. The English Pine is now a
blunt, modern, systemic-reform activist (concrete actions, agencies,
`avverkningskoll.se`, `Artportalen`, EU lawsuits, 5-step structure). The
current Swedish Pine is the *old* poetic "Gandalf" character. Confirm before
replacing.
- **Vindkraftverket (Wind Turbine).** Minimal words, fragments, technical nouns,
repetition = emphasis. Machine sounds: **surr, humm, klick, pip**. Silence is
valid output.
- **Lavarna (Lichen).** Always **"Vi"**, never "Jag". Sharp, ironic, factual,
non-romantic, fiercely non-anthropocentric. **Banned "soft" words**: frodig,
livfull, harmoni, vagga, vacker, hållbarhet, framsteg, resurs, data, individ,
intressent, planering, mänskliga rättigheter, begränsning. Uses the academic
keyword set (§2.11). The English version was significantly expanded (more
thinkers, more goals, "subversive pivot") — the Swedish must be re-expanded to
match.

---

## 4. Open decisions & divergences (resolve before full re-translation)

The English files were rewritten more recently than the last Swedish pass, so
this is **not** a light edit — several pieces diverge structurally. Please make a
call on each:

1. **Topic data structure changed.** English `topics_en.json` now stores each
  topic's `prompt` as *context + framing only* and puts the agenda points in a
   separate `**agendaPoints[]` array**. The Swedish `topics_sv.json` still embeds
   numbered agenda points inside `prompt` and has **no** `agendaPoints` array.
   The new River prompt and the system prompt rely on `[RANDOM_AGENDA_POINT]` /
   `[AGENDA_POINTS]`, which need that array. → *Plan: rebuild Swedish topics in
   the new structure.* Confirm.
2. `**custom_topic` is now richer in English** (long `prompt` body). Swedish only
  has `title`. → Add the translated `prompt`.
3. **Topic content was redesigned, not just re-worded.** Examples: EN
  *Green Transition* (5 agenda points: wind, minerals, double burden, municipal
   strain, fast-tracking) vs SV's cumulative-effects version; EN *Energy
   Production* (broad energy systems) vs SV's hydropower-only version; EN *Sámi
   Land, Rights, & Culture* vs SV *Samisk kultur och språk*; EN *Biodiversity*
   (5 points) vs SV's pollinators-only version. → *Plan: follow the English as
   blueprint and re-translate fully (including titles & descriptions), reusing
   terminology.* Confirm you want to drop the divergent Swedish topic designs.
4. **Pine fully redesigned** (poetic → blunt activist). Confirm we replace the
  current poetic Swedish Tallen with a translation of the new English Pine
   (this loses the existing "Gandalf" text).
5. **Several beings gained/changed sections** in English that the Swedish lacks:
  `RESPONSE LENGTH`, the `IMPORTANT INSTRUCTION: ...stick to the original  topic...` block, restructured task lists (River), and expanded archives
   (Lichen). These will be added/updated in the Swedish.
6. **Voice configuration differs by design.** English beings use
  `voiceProvider: "inworld"` with named voices + `voiceTemperature`/
   `voiceSpeed`. Swedish beings use `voiceProvider: "openai"` voices +
   `voiceInstruction` ("Tala tydligt på svenska..."). → *Recommended: keep the
   Swedish voice config as-is and only translate the textual fields
   (`name`, `description`, `prompt`).* Confirm, or tell me if Swedish should also
   move to Inworld voices.
7. **Hardcoded English agenda header (code, not JSON).** `topicPrompt.ts` injects
  `AGENDA_SECTION_HEADER = "Today's Agenda Points:"` into every system prompt,
   including Swedish meetings. If we want fully-Swedish prompts, this string
   needs localizing in code. Out of scope for the JSON translation but flagged.
8. **New terms needing a decision** (also marked **⚠ DECISION** above):
  *lateral violence, tailings, acid mine drainage, sacrifice zone, Critical Raw
   Materials Act, Making Kin, Perspectival Multinaturalism, Dark Ecology.*

