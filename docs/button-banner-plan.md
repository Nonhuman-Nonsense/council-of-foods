# Button banner — PTT idle UX plan

Unifies **PTT idle timing**, the **rolling hint banner**, and **auto-continue on
abandonment** for HumanInput, meta agent, and voice guide. One naming scheme, one
global banner, one consumer hook — all anchored on **ButtonBanner**.

> **Related:** [ptt-human-input-routing-plan.md](./ptt-human-input-routing-plan.md),
> [realtime-caption-ptt-plan.md](./realtime-caption-ptt-plan.md),
> [meta-agent-realtime-ux-plan.md](./meta-agent-realtime-ux-plan.md),
> [autoplay-layer-a-todo.md](./autoplay-layer-a-todo.md).

**Status:** PR2 complete — PR3 (i18n) pending.

---

## Problem

Today PTT idle UX is inconsistent and scattered:

| Area | Issue |
|------|-------|
| HumanInput | 60s abandon timer; no banner; gated on museum mode only |
| Meta agent | Never-pressed PTT → marquee forever, **no auto-resume** (bug) |
| Marquee | Embedded in `RealtimeCaptionOverlay`; duplicated wiring per consumer |
| Hooks | `useHoldToSpeakHint`, inline terminal effects — different names, different files |
| i18n | Same copy under `setup.holdToSpeak`, `metaAgent.holdToSpeak`, `human.button_museum` |

**Target timeline (all PTT sessions, Option B):**

```
t=0     Session active → idle clock starts → no banner
t=10s   idleRemindActive → ButtonBanner visible
t=20s   onIdleTerminal (skip turn / resume meeting / conclude meeting)
```

Resets on PTT press, transcript/caption activity, successful submit/resume.
Gate: `agentMode === "ptt"` (not museum-only).

---

## Naming baseline: ButtonBanner

All new code uses **ButtonBanner** as the root term. Adapters extend from there.

### Vocabulary

| Term | Kind | Meaning |
|------|------|---------|
| `ButtonBanner` | Component | Global fixed-bottom rolling banner (tomato + copy) |
| `useButtonBanner` | Hook | Idle clock, visibility, store sync, optional terminal callback |
| `bannerVisible` | State | Whether the banner should render for this session |
| `idleRemindActive` | State | True after first idle window — banner phase + terminal arm |
| `bumpBannerActivity()` | Action | Reset idle clock; hide banner until next remind |
| `BUTTON_BANNER_IDLE_MS` | Constant | `10_000` — first idle window and terminal delay |
| `buttonBannerVisible` | Store field | Per-owner publication to `buttonStore` |
| `activeButtonBanner` | Store derived | Winning owner's banner visibility |

### Retired names (do not introduce)

| Old | Replacement |
|-----|-------------|
| `useHoldToSpeakHint` | `useButtonBanner` |
| `usePttIdleTerminal` | `onIdleTerminal` option on `useButtonBanner` |
| `showHoldToSpeakHint` | `bannerVisible` |
| `idleRemindVisible` | `idleRemindActive` |
| `BUTTON_IDLE_REMIND_MS` | `BUTTON_BANNER_IDLE_MS` |
| `setPttHintVisible` / `pttHintVisible` | `setButtonBannerVisible` / `buttonBannerVisible` |
| `GlobalPttHintBanner` / `HoldToSpeakMarquee` | `ButtonBanner` |
| `holdToSpeakKey` prop | Single i18n key (PR3: `museum.ptt.holdToSpeak`) |

Pure helpers move with the hook and rename:

| Old | New |
|-----|-----|
| `computeShowHoldToSpeakHint` | `computeBannerVisible` |
| `shouldShowIdleRemind` | `shouldActivateIdleRemind` |

---

## Architecture

### Layer 1 — Button subsystem (`museum/button/`)

```
buttonStore.ts
  claims, pressed, LED          (existing)
  buttonBannerVisible           per ButtonOwner
  activeButtonBanner            derived via mergeButtonOwner + visible flag
  setButtonBannerVisible()      publish
  releaseButton()               auto-clears banner for that owner

useButton.ts
  claim, release, setLed, pressed   (existing)

useButtonBanner.ts                NEW — single consumer hook (see below)

ButtonBanner.tsx                  NEW — reads activeButtonBanner, renders marquee

MuseumButton.tsx                  unchanged (keyboard + hardware bridge)
```

Mount `<ButtonBanner />` once in `Main.tsx` (next to `MuseumButton`).

### Layer 2 — `useButtonBanner` (one hook, replaces two)

**File:** `museum/button/useButtonBanner.ts`

Merges everything that was split across `useHoldToSpeakHint` and
`usePttIdleTerminal`:

```ts
type UseButtonBannerParams = {
  owner: ButtonOwner;
  sessionActive: boolean;
  micOpen: boolean;
  isConnecting: boolean;
  /** Bump idle clock when these change (transcript / caption activity). */
  activityDeps?: unknown[];
  /** Fired once per idle cycle, BUTTON_BANNER_IDLE_MS after idleRemindActive. */
  onIdleTerminal?: () => void;
  /** Extra guard — return false to suppress terminal (e.g. agent speaking). */
  canIdleTerminal?: () => boolean;
};

type ButtonBannerHandle = {
  bannerVisible: boolean;
  idleRemindActive: boolean;
  bumpBannerActivity: () => void;
};
```

**Internal behaviour:**

1. On `sessionActive` true → start idle clock (`idleRemindActive` false, no banner).
2. After `BUTTON_BANNER_IDLE_MS` idle → `idleRemindActive = true` → `bannerVisible = true`.
3. Sync `bannerVisible` → `buttonStore.setButtonBannerVisible(owner, bannerVisible)`.
4. If `onIdleTerminal` provided and `idleRemindActive` and guards pass →
   `setTimeout(BUTTON_BANNER_IDLE_MS)` → fire once (ref-guarded).
5. PTT press / activity → `bumpBannerActivity()` → reset.

**Consumers still call `useButton(owner)` separately** for claim / LED / `pressed`.
`useButtonBanner` only owns banner + idle timing. Keeps claim lifecycle explicit.

**Voice guide:** pass no `onIdleTerminal` — banner only, no auto-continue.

**HumanInput:**

```ts
const button = useButton("human-input");
const { bannerVisible } = useButtonBanner({
  owner: "human-input",
  sessionActive: agentMode === "ptt" && phase === "active",
  micOpen: button.pressed,
  isConnecting: connectionState === "connecting" || connectionState === "finishing",
  activityDeps: [inputValue, transcriptSegments],
  onIdleTerminal: onAbandonHumanTurn,
  canIdleTerminal: () => !button.pressed && connectionState !== "recording",
});
```

**Meta agent:**

```ts
useButtonBanner({
  owner: "meta-agent",
  sessionActive: metaAgentPhase !== "inactive",
  micOpen: button.pressed,
  isConnecting: connectionState === "connecting",
  activityDeps: [lastUserTranscript, lastCaption],
  onIdleTerminal: () => terminalTool?.({}),
  canIdleTerminal: () => !button.pressed && !agentSpeaking && connectionState === "ready",
});
```

On extension entry: call `bumpBannerActivity()` when chair speaks first (same as
today's extension `bumpActivity`).

### Layer 3 — Primitives (unchanged role)

| Component | Role |
|-----------|------|
| `MarqueeRollingBanner` | Low-level animation + segments — **not** renamed |
| `ReplayModeBanner` | Replay/autoplay copy — separate concern, keeps using primitive |
| `RealtimeCaptionOverlay` | Captions + viz only after PR2 — **no banner** |

---

## Behaviour matrix (final)

| | HumanInput | Meta interrupt | Meta extension | Voice guide |
|--|------------|----------------|----------------|-------------|
| Banner @ 10s idle | Yes | Yes | Yes | Yes |
| Auto-continue @ 20s | `skip_human_turn` | `resume_meeting` | `conclude_meeting` | No |
| Never-pressed abandon | Yes | Yes (bug fix) | Yes | N/A |
| Gate | `agentMode === "ptt"` | `agentMode === "ptt"` | same | `agentMode === "ptt"` |
| `isButtonMuseumMode` | UI only (hide mic/send) | — | — | — |

---

## File map

### New files: **1**

```
client/src/museum/button/ButtonBanner.tsx
client/src/museum/button/useButtonBanner.ts   ← hook + pure helpers + constant
```

### Modified

```
client/src/museum/button/buttonStore.ts       ← banner visibility section
client/src/museum/button/useButton.ts         ← (optional) no change if banner sync stays in useButtonBanner
client/src/main/Main.tsx                      ← mount ButtonBanner
client/src/council/humanInput/HumanInput.tsx
client/src/museum/metaAgent/MeetingMetaAgent.tsx
client/src/voice/MeetingVoiceGuide.tsx
client/src/realtime/RealtimeCaptionOverlay.tsx ← remove banner block + props
client/src/voice/VoiceGuideOverlay.tsx          ← drop banner props
client/tests/…
```

### Deleted / migrated

```
client/src/voice/useHoldToSpeakHint.ts          → logic moves to useButtonBanner.ts; file deleted after migration
client/tests/unit/voice/holdToSpeakHint.test.ts → rename/move to buttonBanner.test.ts
client/tests/unit/voice/useHoldToSpeakHint.test.ts → same
```

---

## PR plan

### PR 1 — Behaviour (`useButtonBanner` + consumers)

**Goal:** Fix abandonment bug and align 20s timeline. No global banner yet.

| Task | Detail |
|------|--------|
| Add `useButtonBanner.ts` | New hook with renamed states; pure helpers + tests |
| HumanInput | Remove 60s timer; gate on `agentMode === "ptt"`; wire `useButtonBanner` |
| MeetingMetaAgent | Replace hint + terminal effects with `useButtonBanner` |
| MeetingVoiceGuide | Replace `useHoldToSpeakHint` with `useButtonBanner` (no terminal) |
| Banner UI (temp) | HumanInput renders local `MarqueeRollingBanner` until PR2 |
| Delete | `useHoldToSpeakHint.ts` after all consumers migrated |
| Tests | 20s timelines; never-pressed meta resume; human abandon in web PTT mode |
| Docs | `autoplay-layer-a-todo.md`: 60s → 20s |

**Not in PR1:** `buttonStore` banner fields, `ButtonBanner` component, i18n moves.

---

### PR 2 — Global `ButtonBanner` + store

**Goal:** Single DOM mount; remove duplicate banner renders.

| Task | Detail |
|------|--------|
| `buttonStore` | `buttonBannerVisible`, `activeButtonBanner`, `setButtonBannerVisible`; clear on `releaseButton` |
| `useButtonBanner` | Sync `bannerVisible` to store for `owner` |
| `ButtonBanner.tsx` | Subscribe to `activeButtonBanner`; render `MarqueeRollingBanner` |
| `Main.tsx` | Mount `<ButtonBanner />` |
| Remove | Local HumanInput marquee (PR1 temp); banner from `RealtimeCaptionOverlay` |
| Simplify | Drop `showHoldToSpeakHint` / `holdToSpeakKey` from overlay props chain |
| Tests | Store priority; hint clears on owner release; single banner in DOM |

**i18n:** keep existing keys (`setup.holdToSpeak`) until PR3.

---

### PR 3 — i18n reorganization

**Goal:** Shallow, sensible namespaces — not a deep tree.

**Full spec:** [i18n-reorganization-plan.md](./i18n-reorganization-plan.md)

| Group | Purpose |
|-------|---------|
| `ptt.*` | ButtonBanner + museum human placeholder (**all PTT mode**, not museum-only) |
| `replay.*` | Replay marquee — **web + museum**; museum uses `replay.pressButton` CTA |
| `autoplay.stillThere.*` | Museum idle warning |
| `agentMode.*` | Toggle labels (from `setup`) |
| `setup.*` | Staff overlay + button diagnostics (keep, trim moved keys) |
| `app.*`, `meeting.*`, `human.placeholder` | Optional light grouping |

**Not under `museum.*`:** replay and PTT are shared surfaces with museum **variants**, not museum-only features.

Leave flat: `name.*`, `error.*`, `reset.*`, etc.

Hard cut — one PR. **Done.**

---

## Test plan

### `useButtonBanner` unit tests

- Session start → no banner; after 10s idle → `bannerVisible` + `idleRemindActive`
- PTT press → resets; release → clock restarts
- `onIdleTerminal` fires at 20s; not before `idleRemindActive`
- Never-pressed → terminal still fires at 20s
- `canIdleTerminal: false` → no terminal
- `bumpBannerActivity()` → resets remind + terminal ref

### Integration

- HumanInput: abandon at 20s with `agentMode === "ptt"`, `isMuseumMode === false`
- Meta agent: `resume_meeting` at 20s without PTT press
- Meta extension: `conclude_meeting` at 20s
- Voice guide: banner at 10s, no terminal
- Button store: human-input owner beats meta-agent; banner clears on `releaseButton`

---

## Migration checklist (for implementers)

- [x] PR1: `useButtonBanner.ts` + consumer migration + delete `useHoldToSpeakHint.ts`
- [x] PR1: HumanInput 60s → 20s; meta never-pressed fix verified
- [x] PR2: `buttonStore` banner fields + `ButtonBanner.tsx` + `Main.tsx` mount
- [x] PR2: Strip banner from `RealtimeCaptionOverlay`
- [ ] PR3: i18n namespace moves + `ButtonBanner` uses `museum.ptt.holdToSpeak`
- [ ] Update cross-doc links in meta-agent-realtime-ux-plan, autoplay-layer-a-todo

---

## Open items

| Item | Notes |
|------|-------|
| Meta agent in non-museum PTT | Out of scope — still gated in `Council.tsx` by `isMuseumMode` |
| Replay banner unification | Stays separate — different content model (links, preamble) |
| `useButton` absorbing banner | Rejected — keep `useButton` for routing/LED; `useButtonBanner` for idle UX |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-30 | PR2: global ButtonBanner + buttonStore banner visibility |
| 2026-06-30 | PR1: `useButtonBanner`, consumer migration, 20s idle behaviour |
| 2026-06-30 | Initial plan — ButtonBanner naming, 3 PRs, supersedes scattered hint/terminal approach |
