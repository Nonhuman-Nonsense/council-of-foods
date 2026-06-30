# i18n rich text & copy flow plan

How translated copy flows through the client today, what i18next already
supports, and when to use each pattern.

> **Related:** [i18n-reorganization-plan.md](./i18n-reorganization-plan.md) (namespace cleanup — done).

**Status:** Phases 1–4 complete (EN only). Swedish locale deferred to downstream fork.

---

## What we have today

Stack: **i18next 26** + **react-i18next 17**, bundled JSON via `import.meta.glob`
(`client/src/i18n.ts`). One namespace (`translation`), `escapeValue: false`.

Only **EN** locale file exists; `AVAILABLE_LANGUAGES = ["en"]` but routing/i18n
is already language-aware for a future `translation_sv.json`.

### Four copy patterns in use

| Pattern | Example | Used in |
|---------|---------|---------|
| **A. Single string** | `landing.description`, `aboutText.about` | About, Landing, Autoplay |
| **B. Interpolation** | `human.panelist` (`{{name}}`), `replay.preamble` (`{{meetingId}}…`) | HumanInput, ReplayModeBanner, Setup hints |
| **C. Numbered segments + JSX** | `contactText.1`…`8`, `disclaimer.1`…`7` | Contact, Summary disclaimer |
| **D. UI blocks** | `incomplete.1` + buttons `incomplete.3`/`4` | Name, QueryExtension, Incomplete |

Pattern **C** exists because inline links sit in the middle of sentences. The
component stitches `{t('…1')}<a>…</a>{t('…2')}`.

### Problems with pattern C

1. **Translators never see the full sentence** — eight keys for one paragraph.
2. **Link labels are hardcoded in TSX**, not in JSON (`Nonhuman Nonsense`,
   `Studio Other Spaces`, grant numbers). When Swedish arrives, link *text*
   won't translate unless duplicated in code.
3. **Word order is fragile** — reordering for another language means re-splitting
   keys differently per locale (or accepting awkward phrasing).
4. **Keys are meaningless** — `contactText.4` tells you nothing; easy to break
   when adding/removing a link.

Pattern **D** with numbered lines (`name.1`, `name.21`) is less bad for
multi-line prompts, but semantic names (`name.prompt`, `name.waitForModerator`)
would still be clearer.

### What's already working well

- **`{{variable}}` interpolation** — used correctly for dynamic values.
- **Separate keys for buttons vs body** — `queryExtension.title` / `.3` / `.4`.
- **Replay banner split** — `replay.preamble` + `replay.click` | `pressButton`
  (variant CTAs, not numbered shards).
- **Shallow namespaces** after PR3 — `ptt`, `replay`, `meeting`, etc.

---

## What i18next supports (that we don't use yet)

### 1. Interpolation — `t('key', { name: 'Alice' })`

Already used. Good for **plain text substitutions**, not for wrapping part of
a string in a link or bold.

```json
"human": { "panelist": "What does {{name}} have to say about this?" }
```

### 2. `<Trans>` — rich text with embedded components/links

**Recommended replacement for pattern C.** One key = one logical paragraph;
translators see the full sentence and reorder `<tags>` per language.

JSON:

```json
"contact": {
  "credits": "The project is an initiative by art & design collective <nhn>Nonhuman Nonsense</nhn> developed in collaboration with <sos>Studio Other Spaces</sos>, <in4art>In4Art</in4art>…"
}
```

Component:

```tsx
import { Trans } from "react-i18next";

<Trans
  i18nKey="contact.credits"
  components={{
    nhn: <a href="https://nonhuman-nonsense.com" />,
    sos: <a href="https://studiootherspaces.net/" />,
    in4art: <a href="https://www.in4art.eu/" />,
  }}
/>
```

- **URLs stay in code** (not translatable — correct).
- **Link labels live in JSON** (translatable).
- **Word order** is fully under translator control via tag placement.
- Works with `escapeValue: false`; Trans parses tags safely when components
  are mapped explicitly (don't use raw `dangerouslySetInnerHTML` for user copy).

Self-closing tags for line breaks: `<br />` in JSON, or split into two keys
if you prefer no markup in JSON.

### 3. Pluralization — `_one` / `_other` (or `_0`, `_1`, …)

Better than `meeting.characters.human` + `twohumans` split:

```json
"meeting": {
  "characters": {
    "humanCount": "{{count}} human",
    "humanCount_other": "{{count}} humans"
  }
}
```

```tsx
t("meeting.characters.humanCount", { count: n })
```

i18next picks the right form per language (Swedish has different plural rules).
Low priority while EN-only, but worth doing before `translation_sv.json`.

### 4. Nesting — `$t(other.key)`

Reuse a shared phrase inside another string. Useful if the same link label
appears in Contact and disclaimer:

```json
"links": { "nonhumanNonsense": "Nonhuman Nonsense" },
"contact": { "credits": "…by <nhn>$t(links.nonhumanNonsense)</nhn>…" }
```

Usually simpler to duplicate short labels unless they're repeated many times.

### 5. HTML / markdown in strings

With `escapeValue: false`, `t('key')` can return `<a href="…">` HTML. **Avoid
for app copy** — hard to audit, awkward for translators, XSS risk if variables
ever include user input. Prefer `<Trans>`.

Summary already uses **marked** for meeting minutes markdown — that's content,
not UI chrome; keep separate.

---

## Decision guide

| Situation | Use |
|-----------|-----|
| Plain label, button, heading | `t('key')` |
| Dynamic value in plain text | `t('key', { var })` |
| Sentence with inline links, bold, or `<br />` | `<Trans i18nKey="…" components={{…}} />` |
| Bullet list with fixed items | Named keys per item (`disclaimer.items.misinformation`) or one `<Trans>` with `<ul><li>` structure |
| Dialog: body + action buttons | Body: `t` or `Trans`; buttons: separate keys (`*.confirm`, `*.cancel`) |
| Count-dependent phrasing | Plural keys (`_one` / `_other`) |
| Long prose, no inline UI | Single string + `whiteSpace: 'pre-wrap'` (like `aboutText.about`) |
| User-generated / server markdown | Parser (marked) — not i18n JSON |

**Rule of thumb:** if you're numbering keys (`1`, `2`, `3`) to wrap JSX,
switch to `<Trans>`.

---

## Proposed JSON shape (rich-text areas)

Rename for clarity when migrating; keep shallow depth.

```json
{
  "contact": {
    "credits": "…<nhn>Nonhuman Nonsense</nhn>…",
    "funding": "…<hec>The Hungry EcoCities project</hec>…<grant>grant agreement 101069990</grant>…",
    "euImageAlt": "Funded by the EU, as part of S+T+ARTS"
  },
  "about": {
    "body": "…long prose…",
    "creditLine": "<link>Nonhuman Nonsense</link>"
  },
  "disclaimer": {
    "intro": "This document was created by…",
    "items": {
      "misinformation": "This document may contain…",
      "notResearch": "The discussions may provide…",
      "takeAction": "Don't just chat about it…"
    },
    "attribution": "Council of Foods is an initiative by <nhn>Nonhuman Nonsense</nhn>…<grant>grant agreement 101069990</grant>…",
    "moreInfo": "For more information, visit council-of-foods.com"
  },
  "name": {
    "title": "SAY SOMETHING",
    "prompt": "Do you want to address the Council of Foods?",
    "instructions": "Please enter your name…<br />and then wait until you are given the floor by Water, the moderator.",
    "placeholder": "your name",
    "enterToProceed": "enter your name to proceed",
    "unique": "name must be unique in the council"
  },
  "queryExtension": { "title", "body", "conclude", "continue" },
  "incomplete": { "title", "body", "resume", "nevermind" }
}
```

Delete: `contactText`, numbered `disclaimer.*`, numbered `name.1`/`21`, etc.

---

## Component changes (sketch)

### Contact.tsx

Replace one `<p>` of `{t}{a}{t}{a}…` with two `<Trans>` blocks (`credits`,
`funding`). Move `contactText.8` alt text to `contact.euImageAlt`.

About credit line uses indexed `<0>` + `components={[<AboutContactLink />]}` because
react-router `Link` does not receive `Trans` children from named tag maps.

### Summary.tsx `Disclaimer`

Replace list + attribution paragraph with:

- `t('disclaimer.intro')`
- three `t('disclaimer.items.*')` list items (or one Trans with `<ul><li>`)
- `<Trans i18nKey="disclaimer.attribution" components={…} />`
- `t('disclaimer.moreInfo')`

Same keys for screen + PDF print view (already duplicated render paths).

### Name / QueryExtension / Incomplete

Rename numeric keys to semantic names; optional `<Trans>` for `name.instructions`
if keeping a line break inside one translatable unit.

No `<Trans>` needed for button labels.

### meeting.characters human count (optional, pre-SV)

Replace `human` / `twohumans` with plural key; update `meetingSetup.ts` to
`t('meeting.characters.humanCount', { count })`.

---

## Optional helper (only if Trans boilerplate repeats)

If many overlays share the same external links, a tiny map keeps hrefs in one
place:

```tsx
// client/src/i18n/linkComponents.tsx
export const externalLinks = {
  nhn: <a href="https://nonhuman-nonsense.com" />,
  hec: <a href="https://starts.eu/hungryecocities/" />,
  starts: <a href="https://starts.eu/" />,
  grant: <a href="https://cordis.europa.eu/project/id/101069990" />,
  // …
} as const;
```

```tsx
<Trans i18nKey="contact.funding" components={externalLinks} />
```

Don't abstract further unless link sets diverge per page.

---

## Testing

| Area | Approach |
|------|----------|
| Unit tests | Mock `Trans` to render `i18nKey` + children, or use real i18n with EN JSON in test setup |
| Trans tags | Snapshot or assert link `href` on rendered `<a>` |
| Interpolation | Existing pattern: mock `t: (k) => k` still works for plain keys |
| E2e | Contact/About: match visible link text from JSON, not hardcoded English in spec |

Add one focused test file: `Contact.test.tsx` with real `translation_en.json`
loaded — catches broken Trans tags early.

---

## Phased rollout

### Phase 1 — Rich text migration (highest value)

**Scope:** Contact, About credit line, Summary disclaimer.

**Why first:** Most numbered segments; most link labels missing from JSON;
blocks clean Swedish.

**Effort:** ~1 PR, mostly Contact + Summary + JSON + tests.

### Phase 2 — Semantic rename (low risk)

**Scope:** `name.*`, `queryExtension.*`, `incomplete.*` — rename `1`/`2`/`3`
to `prompt`/`body`/`confirm`/`cancel`.

**Why:** Readability; no behavior change.

**Effort:** Small PR, string replacements.

### Phase 3 — Plurals & voice-guide labels (before SV)

**Scope:** `meeting.characters.humanCount`; review `meetingon` / `wewilllisten`
(still plain `t`, probably fine).

**Effort:** Small PR + `meetingSetup.ts` tweak.

### Phase 4 — Optional tooling (later)

- **typescript-i18next** — typed keys, autocomplete in `t()` / `Trans`
- **ESLint** — ban new `contactText.\d`-style keys
- **SV locale** — add `translation_sv.json` after patterns stabilise

---

## What not to change

- **Server prompt bundles** — separate system; not in `translation_en.json`.
- **Replay marquee split** — preamble + CTA keys are correct; no Trans needed.
- **Flat chrome keys** — `error.*`, `reset.*`, `app.*` stay as `t()`.
- **Deep nesting** — keep max ~2 levels per [reorganization plan](./i18n-reorganization-plan.md).

---

## Summary

| Question | Answer |
|----------|--------|
| Is numbered segmentation the best way? | **No** — it's a workaround. Use it only when you haven't migrated yet. |
| Better approach for links-in-sentences? | **`<Trans>`** with named tags + `components` map. |
| Variables? | **Yes** — `{{var}}` via `t(key, { var })`. Already supported. |
| Links? | **URLs in code**, **labels in JSON**, wired via `<Trans components>`. |
| Numbered keys for buttons? | **Fine** — but prefer semantic names (`confirm`, not `3`). |

Recommended next step: **Phase 1** (Contact + disclaimer → `<Trans>`), then
semantic renames when convenient.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-30 | Phases 2–4: semantic keys, plurals, typed i18n, ESLint |
| 2026-06-30 | Phase 1 implemented |
