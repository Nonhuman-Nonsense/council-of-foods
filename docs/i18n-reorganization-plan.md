# i18n reorganization plan (PR3)

Cleanup of `client/src/locales/translation_en.json` — **simple namespaces,
shallow keys** (prefer 1–2 levels, avoid deep trees).

> **Related:** [button-banner-plan.md](./button-banner-plan.md) PR3.

**Status:** Complete — PR1 + PR2 + PR3.

**Rules for this pass:**

1. **Hard cut** — update all call sites + tests in one PR.
2. **Max depth ~2** under any top-level group (`replay.preamble`, not `museum.replay.banner.preamble`).
3. **Move only what’s misplaced** — leave working flat keys (`name.*`, `error.*`) unless rename is clearly worth it.
4. **Keys only** — no copy edits unless fixing an obvious typo.

---

## Two different bottom banners (don’t conflate)

| Banner | Component | When | i18n group |
|--------|-----------|------|------------|
| **PTT hint** | `ButtonBanner` | `agentMode === "ptt"` (web + museum) | `ptt.*` |
| **Replay** | `ReplayModeBanner` | Replaying a saved meeting (`!liveKey`) | `replay.*` |

Replay is **not museum-only**. It appears whenever the council is in replay mode.

Museum/autoplay only changes the **CTA line** inside the same replay banner:

- Web replay → `replay.click` (“Click here to start a new meeting.”)
- Museum autoplay loop → `replay.pressButton` (“Press the button…”)

Shared preamble: `replay.preamble`.

---

## Target top-level map

Only **seven** root groups (+ keep a few existing flat trees unchanged):

```
app          Global chrome (start, next, council, …)
landing      Landing page (unchanged)
meeting      New-meeting wizard (topic + characters)
human        Council human input
agentMode    Always-on / PTT labels
ptt          PTT hint + museum human textarea placeholder
replay       Replay marquee (web + museum variant CTAs)
autoplay     Museum idle warning (“Still there?”)
setup        Staff #setup overlay (logging, button diagnostics)
```

**Leave as top-level flat trees** (already clear, low churn):

```
name, incomplete, queryExtension, reset, error, summary, disclaimer,
aboutText, contactText, controls
```

No `overlay.*` wrapper — adds a level without much benefit.

---

## Changes by group

### `ptt` — all PTT mode (not museum-only)

| Current | New |
|---------|-----|
| `setup.holdToSpeak` | `ptt.holdToSpeak` |
| `metaAgent.holdToSpeak` | *(delete — duplicate)* |
| `human.button_museum` | `ptt.humanPlaceholder` |

Consumers: `ButtonBanner.tsx`, `HumanInput.tsx` (museum textarea).

### `replay` — replay mode (web + museum)

| Current | New |
|---------|-----|
| `replayModeBanner.preamble` | `replay.preamble` |
| `replayModeBanner.click` | `replay.click` |
| `replayModeBanner.pressButton` | `replay.pressButton` |

Consumer: `ReplayModeBanner.tsx` — picks `click` vs `pressButton` via `replayBannerVariant`.

### `autoplay` — museum idle warning only

| Current | New |
|---------|-----|
| `autoplayWarning.title` | `autoplay.stillThere.title` |
| `autoplayWarning.body` | `autoplay.stillThere.body` |
| `autoplayWarning.confirm` | `autoplay.stillThere.confirm` |

Consumer: `AutoplayWarning.tsx` (museum-gated in coordinator).

Three levels here (`autoplay.stillThere.title`) — acceptable for one small feature; alternative flat keys `autoplay.warningTitle` if you prefer depth 2 only.

### `agentMode`

| Current | New |
|---------|-----|
| `setup.alwaysOn` | `agentMode.alwaysOn` |
| `setup.pushToTalk` | `agentMode.pushToTalk` |

### `setup` — staff overlay (keep name, trim strays)

**Stays under `setup`:** `title`, `panels`, `logging`, `button.*`, `web`, `museum`.

Only **remove** keys that moved (`holdToSpeak`, `alwaysOn`, `pushToTalk`).

Dynamic paths unchanged except prefix stays `setup.`:

- `setup.button.bridge.${status}`
- `setup.button.owners.${owner}` (`buttonDebug.tsx`)

### `app` — optional light grouping

Only move loose root keys used everywhere:

| Current | New |
|---------|-----|
| `council` | `app.council` |
| `meeting` | `app.meeting` |
| `start` | `app.start` |
| `next` | `app.next` |
| `cancel` | `app.cancel` |
| `restart` | `app.restart` |
| `rotate` | `app.rotate` |

Skip `app.lang.en` / `settings` unless confirmed in use.

### `meeting` — optional light grouping

| Current | New |
|---------|-----|
| `selectissue` | `meeting.selectIssue` |
| `writetopic` | `meeting.customTopicPlaceholder` |
| `theissue` | `meeting.issueHeading` |
| `selectfoods.*` | `meeting.characters.*` (same inner names: `title`, `pleaseselect`, …) |

### `human` — minimal rename

| Current | New |
|---------|-----|
| `human.1` | `human.placeholder` |
| `human.panelist` | `human.panelist` *(unchanged)* |

---

## Delete

| Key | Reason |
|-----|--------|
| `metaAgent.holdToSpeak` | Duplicate of `ptt.holdToSpeak` |
| `setup.mode` | Unused |
| `setup.voiceGuide` | Unused |
| `setup.panels.voiceGuide` | Unused |

---

## What we are **not** doing in PR3

- Deep `overlay.name.intro` renames — keep `name.*` numeric keys for now
- `museum.*` umbrella — museum-specific copy lives in `ptt`, `autoplay`, `setup.museum`, not nested under `museum.replay`
- Renaming `contactText.*` / `disclaimer.*` segments
- Server prompt bundles / topic bundles
- Swedish locale file

---

## Example target JSON (abbreviated)

```json
{
  "app": {
    "council": "Council of Foods",
    "meeting": "Meeting",
    "start": "Start",
    "next": "Next",
    "cancel": "Cancel",
    "restart": "Restart",
    "rotate": "rotate your device"
  },
  "landing": { "welcome": "...", "description": "...", "go": "..." },

  "meeting": {
    "selectIssue": "please select an issue for the discussion",
    "issueHeading": "THE ISSUE",
    "customTopicPlaceholder": "Write a topic here...",
    "characters": {
      "title": "THE FOODS",
      "pleaseselect": "...",
      "human": "1 human: ",
      "twohumans": " humans: "
    }
  },

  "human": {
    "placeholder": "Type your question or start recording...",
    "panelist": "What does {{name}} have to say about this?"
  },

  "agentMode": {
    "alwaysOn": "Always On",
    "pushToTalk": "Push to Talk"
  },

  "ptt": {
    "holdToSpeak": "Push the button to speak",
    "humanPlaceholder": "Press and hold the button to talk, release to submit"
  },

  "replay": {
    "preamble": "This is a replay of the meeting #{{meetingId}}: ...",
    "click": "Click here to start a new meeting.",
    "pressButton": "Press the button to start a new meeting."
  },

  "autoplay": {
    "stillThere": {
      "title": "Still there?",
      "body": "You have been inactive for a while,\npress the button if you are still there.",
      "confirm": "I'm still here!"
    }
  },

  "setup": {
    "title": "SETUP",
    "web": "Web",
    "museum": "Museum",
    "panels": { ... },
    "logging": { ... },
    "button": { ... }
  },

  "name": { ... },
  "error": { ... },
  "controls": { "wait": "..." }
}
```

---

## Execution order

1. Add new keys + update `translation_en.json` structure
2. Update components (small batches: `ptt` → `replay` → `autoplay` → `agentMode` → `setup` trim → `app`/`meeting`/`human` if included)
3. Update tests + e2e (`button_setup.spec.ts` JSON paths stay under `setup.button.*`)
4. Grep for old prefixes — zero hits
5. `npm test`

**Recommend one PR** — mostly string replacements.

---

## Files to touch

| Priority | Files |
|----------|-------|
| Must | `translation_en.json`, `ButtonBanner.tsx`, `HumanInput.tsx`, `ReplayModeBanner.tsx`, `AutoplayWarning.tsx`, `Setup.tsx` |
| Must | `Setup.test.tsx`, `HumanInput.test.jsx`, `AutoplayWarning.test.tsx` |
| If `app`/`meeting`/`human` included | `Landing`, `SelectTopic`, `SelectCharacters`, `Navbar`, `Summary`, overlay components |
| Docs | `button-banner-plan.md`, `autoplay-plan.md` |

---

## Test plan

- Full client unit tests
- Grep: `setup.holdToSpeak`, `metaAgent`, `replayModeBanner`, `autoplayWarning`, `human.button_museum`, `human.1` → none
- E2e button setup spec still resolves `setup.button.*`

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-30 | PR3 implemented |
| 2026-06-30 | Initial audit |
