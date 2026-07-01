# Summary / Council flex layout plan

Goal: fix the web summary bottom-spacing and replay-banner bugs by giving the
**bottom UI + overlay** a real flex relationship — **without** disturbing the
absolute/fixed full-viewport layout that the scene, loading, human input, and
meta-agent already depend on.

---

## Problems we are solving

1. **Web live summary** — PDF download row (and protocol bottom edge) sits too high.
2. **Web replay summary** — replay banner ("button banner") not visible.
3. **Web replay during a meeting** — banner shows fine (must stay working).
4. **Dim backdrop** — when a council overlay (e.g. summary) is open, the dim
   must cover the **background/scene** while the **controls and replay banner
   stay visible above it**.

Out of scope here (separate step): replay banner copy/variant tweaks.

---

## Current layout audit (positioning contexts)

Everything inside `Council` is positioned against the **Main route `Overlay`**
(`client/src/main/overlay/Overlay.tsx` → `position: absolute; minHeight: 100%; width: 100%`),
which spans the full viewport. That is the nearest positioned ancestor today.

| Element | File | Positioning | Anchored to |
|---------|------|-------------|-------------|
| Main route `Overlay` (wraps `<Routes>`) | `main/overlay/Overlay.tsx` | `absolute; minHeight:100%` | viewport |
| `FoodsCouncilScene` foods row | `council/FoodsCouncilScene.tsx` | `absolute; top:62%` | full viewport |
| `FoodsCouncilScene` background | same | `absolute` (fills) | full viewport |
| `Loading` | `main/Loading.tsx` | `absolute; top:84%` | full viewport |
| `MeetingMetaAgent` → `Loading` | `museum/metaAgent/MeetingMetaAgent.tsx` | `absolute` | full viewport |
| `MeetingMetaAgent` → `RealtimeCaptionOverlay` | `realtime/RealtimeCaptionOverlay.tsx` | `fixed; bottom:0` | viewport (immune) |
| `HumanInput` wrapper | `council/humanInput/HumanInput.tsx` | `absolute; bottom:0` | full viewport |
| **Bottom column** (Output + Controls + ReplayBanner) | `council/Council.tsx` | `absolute; bottom:0; left:0; right:0; flex column` | full viewport |
| Council `Overlay` (CouncilOverlays/Summary) | `council/Council.tsx` + `Overlay.tsx` | `absolute; minHeight:100%; flex center` | full viewport |
| `OverlayWrapper` (centers summary) | `main/overlay/OverlayWrapper.tsx` | flex center, `marginTop:60px` desktop | within council Overlay |

### Why the bugs happen

- **Live summary too high:** `Summary` web wrapper double-reserves bottom space
  (`marginBottom: 56px` **and** `paddingBottom: 56px`, plus a `maxHeight` that
  subtracts `60 + 56 + 20 + 40`). Combined with the double centering (council
  `Overlay` centers, then `OverlayWrapper` centers again), the block floats up.
  The reserve is a guess that does not match the real footer height.
- **Replay banner missing on summary:** `ReplayModeBanner` →
  `MarqueeRollingBanner` paints at `--z-marqueeBanner` (**2**). It lives in the
  bottom column. When a council overlay is open, the council `Overlay`
  (`--z-routeOverlay` = **5**, with a dimming backdrop) renders later in the DOM
  and **covers** the banner. `ConversationControls` survives only because
  `onTopOfOverlay` raises it to **10**. During a normal meeting no council
  overlay is active, so the banner shows.
- **The dim is welded to the overlay box:** the shared `Overlay`
  (`main/overlay/Overlay.tsx`) puts `backgroundColor: rgba(0,0,0,0.5)` +
  centering + `z-index:5` on **one** full-viewport div. So "dim" and "overlay
  content" cannot be stacked independently — anything that should sit *above the
  dim but below/around the content* (controls, replay banner) has to fight it
  with ad-hoc higher z-indices. This is the root of both the banner bug and the
  "controls above dim" requirement.

---

## Chosen approach — "Footer-aware overlay flex" (minimal blast radius)

Do **not** wrap the scene / loading / human input / meta-agent in the flex
column. They stay as full-viewport absolute/fixed siblings, so their contexts are
untouched. Introduce **one** full-viewport flex column that owns only:

- a **main region** (`flex: 1; min-height: 0; position: relative`) → the council
  `Overlay` (CouncilOverlays / Summary)
- a **footer region** (`flex-shrink: 0`) → `Output` + `ConversationControls` +
  `ReplayModeBanner`

```
Council returns:
<>
  <FoodsCouncilScene/>     ← absolute, full viewport   (UNCHANGED)
  <Loading/>               ← absolute, full viewport   (UNCHANGED)
  <MeetingMetaAgent/>      ← absolute/fixed            (UNCHANGED)
  <HumanInput/>            ← absolute bottom:0         (UNCHANGED)

  <div class="council-shell"            ← NEW: position:absolute; inset:0;
       style="display:flex; flex-direction:column; pointer-events:none">

    <div class="council-shell__backdrop" ← NEW dim: position:absolute; inset:0;
         (shown when visibleOverlay !== null)   background: rgba(0,0,0,.5);
                                                z-index: councilOverlayBackdrop
                                                covers the WHOLE background

    <div class="council-shell__main"    ← flex:1; min-height:0; position:relative;
         z-index: councilOverlayContent (above backdrop)
      <CouncilOverlays/>  ← transparent container (NO own dim) … Summary etc.
    </div>

    <div class="council-shell__footer"  ← flex-shrink:0; position:relative;
         z-index: councilFooter (above backdrop)
      <Output/>
      <ConversationControls/>
      <ReplayModeBanner/>
    </div>
  </div>
</>
```

The dim becomes its **own full-viewport layer** between the scene and the
footer/overlay-content. The shared `Overlay`'s built-in `rgba(0,0,0,.5)` is no
longer used for council overlays (passed transparent / replaced by the backdrop),
so dim and content stack independently.

Why this fixes all four:

- **Summary sits above the footer naturally** → no `calc(100dvh - …)` /
  `paddingBottom` / `marginBottom` hacks. Download row lands just above controls
  in live mode.
- **Replay banner lives in the footer, below the overlay region** → it is no
  longer painted under the council `Overlay`, so it shows on summary. ✓
- **Live vs replay differ for free** → footer is taller when the banner exists;
  the `flex:1` main region shrinks to match. No per-mode constants.
- **Normal-meeting banner unchanged** → still rendered in the footer.
- **Dim covers background, controls/banner above it** → dedicated backdrop layer
  sits below the footer and overlay-content z-indices (see stacking table).

`pointer-events: none` on the shell keeps the scene clickable; interactive
children re-enable it (overlay content / clickers, controls, and the banner link
set their own `pointer-events:auto`). The backdrop is `pointer-events:none` — the
existing `OverlayWrapper` clicker divs (inside the content layer) still handle
click-to-dismiss on web.

---

## Dim backdrop & z-index stacking

### Current ordering (relevant layers)

| Layer | `z` | Role |
|-------|-----|------|
| background / zoomed bg | -5…-1 | scene |
| `gradientFooter`, `councilSceneShade` | 1 | scene shading |
| `marqueeBanner` (replay/PTT marquee) | 2 | banner content (inert without positioned parent) |
| `councilControls` | 3 | controls (normal) |
| `humanInputField`, `realtimeCaption` | 4 | human input field / caption |
| `routeOverlay` / `overlayWrapper` | 5 | council `Overlay` **+ its dim** |
| `navbar`, `councilControlsRaised`, `fullscreenButton` | 10 | controls raised over overlay (`onTopOfOverlay`) |
| `bottomBanner` | 11 | museum PTT `ButtonBanner` anchor (fixed) |
| `overlayCloseButton`, `systemOverlay` | 20 | summary X / blocking modals |

Problem: the dim **is** the `z:5` overlay box. To beat it, controls jump to `10`;
the replay banner (`2`) has no escape, so it stays hidden.

### Target ordering (council-internal, inside the route Overlay's `z:5` context)

| Layer | `z` | Role |
|-------|-----|------|
| scene / shading | ≤ 1 | unchanged |
| **`councilOverlayBackdrop`** (NEW) | **2** | full-viewport dim — covers background |
| **`councilFooter`** (NEW; container) | **3** | footer band: `Output` + controls + replay banner all paint above the dim |
| **`councilOverlayContent`** (NEW; container) | **4** | summary / overlay content above the dim |
| `overlayCloseButton` | 20 | summary X (unchanged) |

Notes:
- Footer is a **positioned container with its own z** → every child (incl. the
  replay banner that was stuck at `marqueeBanner:2`) paints above the backdrop
  without per-child z hacks. The `onTopOfOverlay` → `councilControlsRaised` hack
  becomes redundant (keep or drop; harmless).
- These three new values live **inside** the Main route `Overlay`'s `z:5`
  stacking context, so they only order Council's own children. Global layers
  (`navbar:10`, `bottomBanner:11`, `systemOverlay:20`) are siblings of that
  context and keep winning — autoplay warning, error, museum PTT banner, and the
  navbar all stay on top exactly as today.
- Museum summary (`position:fixed; inset:0`) renders inside the content layer
  (above the backdrop) and visually covers the screen anyway — backdrop behind it
  is harmless.

### Stacking verification (summary open, web)

```
scene/background ........ ≤1   (dimmed)
councilOverlayBackdrop .. 2    ← dims the whole background ✓
footer (Output/controls/replay banner) 3  ← visible ABOVE dim ✓✓
summary content ......... 4    ← above dim ✓
summary close X ......... 20   ← top ✓
(navbar 10 / systemOverlay 20 are outside, unaffected)
```

---

## Components keep their relative context — verification

| Component | Risk | Verdict |
|-----------|------|---------|
| `FoodsCouncilScene` (`top:62%`) | Would shift if nested in a shorter `flex:1` box | **Safe** — stays a full-viewport absolute sibling outside the shell |
| `Loading` (`top:84%`) | Same shift risk | **Safe** — unchanged sibling |
| `MeetingMetaAgent` `Loading` / caption | Caption is `fixed` (viewport); loader absolute | **Safe** — unchanged |
| `HumanInput` (`bottom:0`) | Bottom anchor | **Safe** — stays full-viewport sibling; overlaps footer band exactly as today |
| `ConversationControls` | Must stay above overlay | **Safe** — now in footer (outside/under overlay region); `onTopOfOverlay` no longer needed but kept harmless |
| `ReplayModeBanner` | Hidden behind overlay today | **Fixed** — in footer (z `councilFooter`), above the dim backdrop |
| `Output` / `TextOutput` | Subtitle placement | **Safe** — footer keeps the same `flex column; align-items:center` as the old bottom column |
| **Dim backdrop** | Must cover background, not controls/banner | **Fixed** — dedicated full-viewport `councilOverlayBackdrop` (z 2) below footer (3) + content (4); shared `Overlay` dim no longer used for council overlays |
| Other overlays (`name`, `incomplete`, `query_extension`) | Centered content shifts up by half the footer height | **Safe** — for these states `controlsVisible` is false, so footer is ~empty (only the replay banner in replay), shift is negligible |
| **Museum summary** | Full-bleed fixed layout | **Safe** — `Summary` keeps `position:fixed; inset:0`, breaking out of the shell; footer controls hidden anyway |

---

## What changes vs stays

**Changes**
- `Council.tsx`: wrap the council overlay + bottom UI in the `council-shell`
  flex column with a **dedicated dim backdrop** child. Move
  `Output`/`ConversationControls`/`ReplayModeBanner` into the footer region.
  Scene/Loading/MetaAgent/HumanInput remain siblings above it. Render council
  overlays in a **transparent** container (no shared-`Overlay` dim).
- `zIndexLayers.ts`: add `councilOverlayBackdrop` (2), `councilFooter` (3),
  `councilOverlayContent` (4). (Re-publishes as `--z-*` automatically.)
- `Summary.tsx` (web only): drop `maxHeight` / `marginBottom` / `paddingBottom`
  / `controlsClearance` reserve. Use internal column flex:
  - scroll area: `flex:1; min-height:0`
  - download row: `flex-shrink:0`
- `App.css`: add `.council-shell`, `.council-shell__backdrop`,
  `.council-shell__main`, `.council-shell__footer` with the new z vars.

**Stays the same**
- Scene, loading, meta-agent, human input positioning.
- Museum full-bleed summary, teleprompter, button/banner/timers.
- `ReplayModeBanner` component internals (only its DOM home moves into the footer).
- Overlay close-X behaviour (`showX`).
- Shared `Overlay` component (still used by Main route + system overlays); we just
  stop relying on its dim for council overlays.

---

## Visibility matrix (target)

### Council footer (flex-shrink:0)

| UI | Web live | Web replay | Museum live | Museum replay |
|----|----------|------------|-------------|---------------|
| `Output` | ✓ (meta-agent off) | ✓ | ✓ | ✓ |
| `ConversationControls` | ✓ playing/waiting/summary† | ✓ | hidden (`hidden={isMuseumMode}`) | hidden |
| `ReplayModeBanner` | ✗ | ✓ (`!liveKey`) | ✗ | ✓ |
| `HumanInput` (sibling, not footer) | ✓ when participating | ✗ | ✓ (PTT) | ✗ |

† summary controls require `councilState==="summary"` **and** summary audio exists.

### Summary overlay detail

| UI / behaviour | Web live | Web replay | Museum PTT |
|----------------|----------|------------|------------|
| Protocol scroll | ✓ (flex:1 in main region) | ✓ | ✓ full-viewport fixed |
| PDF download row | ✓ (flex-shrink:0) | ✓ | ✗ |
| Overlay close (X) | ✓ | ✓ | ✗ |
| Controls in footer | ✓ | ✓ | hidden |
| Replay banner in footer | ✗ | ✓ **(fixed)** | ✗ |
| Summary "press to restart" banner | ✗ | ✗ | ✓ |
| Hardware button → root | ✗ | ✗ | ✓ immediate |
| Auto 20s → root (non-autoplay) | ✗ | ✗ | ✓ |
| Auto 5s → next meeting (autoplay loop) | — | — | ✓ |
| Teleprompter autoscroll | ✗ | ✗ | ✓ |

### Meeting phase × main region

| Phase | Main region content | Footer |
|-------|---------------------|--------|
| `loading` | scene + `Loading` (siblings) | Output (+ banner if replay) |
| `playing`/`waiting` | scene | Output + controls (+ banner if replay) |
| `human_input`/`human_panelist` | scene + `HumanInput` (sibling) | Output + controls |
| overlays (`name`/`incomplete`/`query_extension`/`summary`) | council `Overlay` | per matrix above |

---

## Implementation steps

1. **zIndexLayers.ts** — add `councilOverlayBackdrop: 2`, `councilFooter: 3`,
   `councilOverlayContent: 4` (kept below the global `navbar/bottomBanner/
   systemOverlay` layers).
2. **App.css** — add shell classes:
   - `.council-shell { position:absolute; inset:0; display:flex; flex-direction:column; pointer-events:none; }`
   - `.council-shell__backdrop { position:absolute; inset:0; background:rgba(0,0,0,.5); z-index:var(--z-councilOverlayBackdrop); pointer-events:none; }`
   - `.council-shell__main { position:relative; flex:1 1 auto; min-height:0; z-index:var(--z-councilOverlayContent); }`
   - `.council-shell__footer { position:relative; flex:0 0 auto; z-index:var(--z-councilFooter); display:flex; flex-direction:column; align-items:center; overflow:visible; }`
3. **Council.tsx** — build the shell: backdrop (when `visibleOverlay !== null`)
   + main (CouncilOverlays in a transparent container) + footer
   (Output/Controls/ReplayBanner). Leave scene/loading/meta-agent/human-input as
   full-viewport siblings. Stop passing the shared `Overlay`'s dim for council
   overlays (render transparent; keep `pointer-events:auto` on interactive bits).
4. **Summary.tsx** — web wrapper → internal column flex; remove bottom-reserve
   constants; museum branch untouched.
5. **Tests** — update `Summary.test.tsx` web layout assertions (no more fixed
   `paddingBottom`/`maxHeight`; assert flex roles). Museum assertions unchanged.

---

## Regression checklist

- [ ] Web live summary — download row just above controls; protocol bottom aligns.
- [ ] Web replay summary — download + controls + **replay banner** all visible.
- [ ] Web replay during meeting — banner + controls unchanged.
- [ ] Summary open — dim **covers the whole background/scene**, while controls
      and replay banner are **clearly visible above the dim**.
- [ ] Other overlays (`name`/`incomplete`/`query_extension`) — dim still covers
      background; no double-dim, no banner/control bleed-through.
- [ ] z-index sanity — navbar, museum PTT banner, autoplay warning, error, and
      close-X all still paint above the council shell.
- [ ] Web meeting (live) playing/waiting — subtitles + controls placed as before.
- [ ] `human_input` (live) — input not clipped by footer.
- [ ] `name` / `incomplete` / `query_extension` overlays — centered, no shift.
- [ ] Museum summary — full-bleed, teleprompter, button/banner/20s+5s timers intact.
- [ ] Museum meeting — no controls, meta-agent + caption + human input OK.
- [ ] Loading spinner (`top:84%`) and foods row (`top:62%`) unmoved in all modes.
- [ ] Mobile breakpoints — same matrix with smaller control/download heights.

---

## Out of scope / follow-ups

- Replay banner copy/variant polish on summary.
- If we later want the footer itself slightly dimmed (rather than fully bright
  above the backdrop), add a low-opacity scrim *inside* the footer — but per the
  current requirement the controls/banner stay fully visible above the dim.
