# Unified bottom banner plan

Goal: one global marquee banner with owner-based priorities — no duplicate
banners on museum replay summary (or anywhere else).

---

## Current state — two separate systems

### 1. Global `ButtonBanner` (PTT system)

| | |
|---|---|
| **Mount** | `Main.tsx` — only when `agentMode === "ptt"` |
| **Position** | `position: fixed; bottom: 0` via `.bottom-ui-banner-anchor` (`z-bottomBanner: 11`) |
| **Visibility** | `buttonStore.activeButtonBanner` — follows the **current `buttonOwner`** |
| **Content** | Plain i18n string via `bannerMessageKeys[owner]` |
| **Consumers** | `useButtonBanner` hook from Summary, HumanInput, MeetingMetaAgent, MeetingVoiceGuide |

`buttonStore` already has owner priorities for **both** button routing and banner
visibility:

```
setup: 4
autoplay: 3
human-input: 2
summary: 2
voice-guide: 1
meta-agent: 1
```

When multiple owners claim the button, `mergeButtonOwner` picks the highest
priority; `resolveActiveButtonBanner` only shows the banner for that winner.

### 2. `ReplayModeBanner` (separate, always-on during replay)

| | |
|---|---|
| **Mount** | `Council.tsx` → `council-shell__footer` |
| **Position** | Inline in the flex footer (not fixed, not in buttonStore) |
| **Visibility** | `visible={!liveKey}` — always shown for the whole replay session |
| **Content** | Rich: meeting ID/title/date preamble + CTA (`replay.click` or `replay.pressButton`) + optional `<Link>` |
| **Variant** | `replayBannerVariant` from `useAutoplay()` (`"autoplay"` when exhibition loop active) |

Uses the same `MarqueeRollingBanner` primitive but is **completely outside**
the priority system.

---

## Why museum replay summary shows two banners

On museum PTT + replay + summary overlay:

1. **`ReplayModeBanner`** in the council footer — replay preamble (always on for replay).
2. **`Summary`** calls `useButtonBanner({ owner: "summary", bannerImmediate: true, messageKey: "summary.banner.pressToRestart" })` → global **`ButtonBanner`** shows “press to restart”.

Both are visible at once. They stack in the footer area.

On **web replay summary** only `ReplayModeBanner` shows (ButtonBanner is not
mounted because `agentMode !== "ptt"`).

---

## Chosen approach — bring replay into `buttonStore`

Keep **one render site** (`ButtonBanner` in Main) and **one priority table**.
Replace the footer `ReplayModeBanner` with the **same existing hooks** `Summary`
already uses — no new `useReplayBanner` hook or `ReplayBannerContent` component.

### Target architecture

```
Main.tsx
  ButtonBanner          ← single MarqueeRollingBanner (fixed bottom anchor)
    reads buttonStore; adds one `kind: "replay"` render branch

Council.tsx             ← replay session owner (like Summary owns "summary")
  useButton("replay") + claim / setLed("pulse") / press → navigate(root)
  useButtonBanner({ owner: "replay", bannerImmediate: true, bannerContent })
  (delete <ReplayModeBanner /> from footer; delete ReplayModeBanner.tsx)

Summary.tsx             ← unchanged; wins over replay at priority 2
  useButton("summary") + useButtonBanner(...)
```

**No new files.** Only touch existing: `buttonStore`, `useButtonBanner`,
`ButtonBanner`, `Council`, `Main`, and delete `ReplayModeBanner.tsx`.

### New `ButtonOwner`: `"replay"`

Add to `BUTTON_OWNER_PRIORITY` at **1** (same tier as voice-guide / meta-agent):

```
setup: 4
autoplay: 3
human-input: 2
summary: 2
replay: 1          ← NEW
voice-guide: 1
meta-agent: 1
```

**Why priority 1:** replay is a passive “you are watching a recording” hint.
It should yield to summary (`2`) and human-input (`2`) when those sessions are
active. That fixes the museum replay summary duplicate without a special case.

**Replay claims the button** (`claimButton("replay")`) for the whole replay
session — same pattern as `summary`, `human-input`, etc. No separate banner
routing layer; existing `buttonOwner` + `resolveActiveButtonBanner` stay as-is.

Tie-breaking among equal priorities: existing `mergeButtonOwner` iterates
`Object.keys(claims)`. During replay there is no `meta-agent` claim (`liveKey`
is null), so ties with `replay` are rare. If needed later, prefer explicit
tie-break (e.g. `summary` > `replay` at same priority) — not required for v1.

### Extend `buttonStore` for rich banner content

Today banners only support `bannerMessageKeys: Partial<Record<ButtonOwner, string>>`.

Replay needs structured data, not a single key. Add:

```ts
export type BannerContent =
  | { kind: "message"; messageKey: string }
  | {
      kind: "replay";
      meetingId: number;
      meetingTitle: string;
      meetingDate: string;       // pre-formatted locale string
      variant: ReplayBannerVariant;
      isPaused: boolean;
    };

type ButtonStore = {
  // ...existing...
  bannerContent: Partial<Record<ButtonOwner, BannerContent>>;
  setButtonBannerContent: (owner: ButtonOwner, content: BannerContent | undefined) => void;
};
```

- `setButtonBannerMessageKey` continues to work for simple owners (writes
  `{ kind: "message", messageKey }` or keep both fields during migration).
- `releaseButton` / cleanup clears `bannerContent[owner]` like other per-owner maps.

`ButtonBanner` reads `bannerContent[buttonOwner]` and branches:

| `kind` | Render |
|--------|--------|
| `message` | Current behaviour: `t(messageKey)`, 14 segments, no wrap |
| `replay` | Move JSX from today’s `ReplayModeBanner` inline into `ButtonBanner` (3 segments, `<Link>` wrap when `variant: "default"`) |

### Council — replay wiring (mirror `Summary.tsx`)

When `replayManifest && !liveKey`:

```ts
const replayActive = replayManifest != null && !liveKey;
const button = useButton("replay");

useEffect(() => {
  if (!replayActive) return;
  button.claim();
  return () => button.release();
}, [replayActive, button.claim, button.release]);

useEffect(() => {
  if (!replayActive) return;
  button.setLed("pulse");
}, [replayActive, button.setLed]);

useButtonBanner({
  owner: "replay",
  sessionActive: replayActive,
  micOpen: false,
  isConnecting: false,
  bannerImmediate: true,
  bannerContent: replayActive ? { kind: "replay", meetingId, ... } : undefined,
});

// rising-edge press → navigate(rootPath)  (same pattern as Summary)
```

### Extend `useButtonBanner` (small addition)

Add optional `bannerContent?: BannerContent` to `UseButtonBannerParams`. When
set, sync to `buttonStore.setButtonBannerContent` in the same effects that
already sync `messageKey` / `bannerVisible`. Simple message owners keep using
`messageKey` only — no change for HumanInput, meta-agent, etc.

### Press / keyboard side effects (accepted)

Claiming the button means replay becomes routable input when it wins
`buttonOwner`:

| Input | Behaviour |
|-------|-----------|
| Museum hardware button | Press → `onPress()` → navigate to root / new meeting |
| Space (PTT keyboard path) | Same when `agentMode === "ptt"` and replay owns the button |
| Web replay + Space | Today keyboard is gated on `agentMode === "ptt"` in `buttonStore`. **Accepted:** if we also route Space when `buttonOwner === "replay"` (even in web mode), Space on web replay would start a new meeting — user is fine with that. Optional small loosening of the keyboard gate for replay-only. |
| Web replay click | Marquee `<Link to={rootPath}>` remains for mouse users (`variant: "default"`). |

Summary at priority `2` takes over button + banner on museum replay summary;
replay release happens implicitly when summary claims (summary wins merge) — but
both may still hold claims. Replay hook should keep its claim for the whole
replay session; only banner/LED routing changes when summary wins. Press on
summary overlay goes to summary handler, not replay.

### Mount `ButtonBanner` for replay on web

Today:

```tsx
{agentMode === "ptt" && <ButtonBanner />}
```

Change to always mount (lazy Suspense is fine):

```tsx
<Suspense fallback={null}>
  <ButtonBanner />
</Suspense>
```

`ButtonBanner` already renders nothing when `activeButtonBanner === false`. Web
live meetings never register a banner → no visible change. Web replay registers
from `Council` via `useButtonBanner` → banner appears from the global anchor.

Remove the `agentMode !== "ptt"` early return inside `ButtonBanner` (or keep as
a guard only for default fallback message key — prefer removing).

### Remove `ReplayModeBanner`

- Delete `<ReplayModeBanner />` from `Council.tsx` footer.
- Delete `ReplayModeBanner.tsx` — its JSX moves into `ButtonBanner`’s replay branch.
- Footer becomes: `Output` + `ConversationControls` only.

### Positioning / z-index

Replay moves from `council-shell__footer` (z `councilShellFooter: 2`) to fixed
`bottom-ui-banner-anchor` (z `bottomBanner: 11`).

This is **better** for summary overlay: banner stays above the dim backdrop and
matches PTT banner placement. Verify visually that fixed bottom + footer controls
don’t overlap awkwardly on web replay (they didn’t before on PTT; replay was in
footer below controls).

If overlap occurs, add bottom padding to the footer when `activeButtonBanner` —
only if needed after visual check.

---

## Visibility matrix (target)

| Context | Banner shown | Owner | Content |
|---------|--------------|-------|---------|
| Web live meeting | — | — | — |
| Web replay meeting | Replay preamble | `replay` | rich |
| Web replay summary | Replay preamble* | `replay` | rich (summary banner is museum-only today) |
| Museum PTT live meeting | PTT hints / meta-agent | `human-input` / `meta-agent` | message |
| Museum PTT replay meeting | Replay preamble | `replay` | rich |
| Museum PTT replay summary | Press to restart | `summary` | message (wins over replay) |
| Museum PTT summary (live) | Press to restart | `summary` | message |
| Setup / voice guide | Setup / voice copy | `voice-guide` / `setup` | message |

\*On web replay summary, we may later want summary-specific copy instead of replay
preamble — out of scope unless requested.

---

## Implementation steps

1. **`buttonStore.ts`**
   - Add `"replay"` to `ButtonOwner` and `BUTTON_OWNER_PRIORITY` (priority `1`).
   - Add `BannerContent` type and `bannerContent` map.
   - Add `setButtonBannerContent`; clear `bannerContent[owner]` on `releaseButton`.

2. **`useButtonBanner.ts`**
   - Add optional `bannerContent?: BannerContent` param; sync to store alongside
     existing `messageKey` / visibility effects.

3. **`ButtonBanner.tsx`**
   - Remove `agentMode !== "ptt"` gate.
   - Add `kind: "replay"` branch (inline JSX from `ReplayModeBanner`).
   - Fallback to `messageKey` for simple owners.

4. **`Main.tsx`**
   - Mount `ButtonBanner` unconditionally (keep Suspense).

5. **`Council.tsx`**
   - Wire replay with `useButton("replay")` + `useButtonBanner` + press effect
     (mirror `Summary.tsx`).
   - Remove `<ReplayModeBanner />` from footer.

6. **Delete `ReplayModeBanner.tsx`**

7. **Tests**
   - `buttonStore.test.ts`: replay claim + banner; summary overrides replay.
   - `useButtonBanner.test.ts`: `bannerContent` sync.
   - `ButtonBanner.test.tsx`: replay rich content, web mode render.
   - `Council.test.tsx`: replay wired via store, no footer marquee.

---

## Regression checklist

- [ ] Museum PTT replay summary — **one** banner (“press to restart”), not two.
- [ ] Museum PTT replay during meeting — replay preamble only.
- [ ] Museum PTT replay — hardware button / Space → navigate to root.
- [ ] Web replay — Space → navigate to root (if keyboard gate extended); Link still works.
- [ ] Web replay meeting + summary — single replay banner, above dim, controls visible.
- [ ] Web live — no banner.
- [ ] Museum PTT human input — PTT idle banner still works; replay hidden.
- [ ] Museum meta-agent — meta-agent banner still wins over replay when active.
- [ ] Exhibition autoplay loop — `replay.pressButton` variant still used.
- [ ] Web replay CTA link to root still works (`variant: "default"`).
- [ ] Marquee pauses when meeting paused (`isPaused`).
- [ ] No duplicate marquees in any mode.

---

## Out of scope

- Replay banner copy changes on summary (e.g. different text when protocol open).
- Moving `ButtonBanner` into the council shell footer (fixed global anchor is fine).
- Autoplay warning overlay (separate `systemOverlay` layer).
