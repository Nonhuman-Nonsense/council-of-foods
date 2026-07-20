# Setup Agent — Tools & State Plan

This document tracks the intended tool set, state flow, and implementation phases for the setup agent agent (`setupAgentPromptEn.ts` / `setupAgentTools.ts`).

**Status:** Phase 1 done. Phase 2 partial. Phase 3 open.

| Phase | Status |
|-------|--------|
| **1** — Tool set refactor | **Done** — see tool table below |
| **2** — Initial state in prompt | **Partial** — `phase` is in the prompt; `selectedTopicTitle` / `selectedCharacterNames` not yet passed through `SetupAgentPromptParams` |
| **3** — UI-click state sync | **Open** — `meetingSetup.ts` still emits JSON `(STATE SYNC: …)` instead of plain-English `STATE UPDATE:` |

---

## Architecture — how the session works

| Event | What happens |
|-------|-------------|
| Landing → Topic | **Navigation** (`navigate(newMeetingPath)`) unmounts `MeetingSetupAgent` → session tears down and reconnects with new instructions (`phase: "topic"`). |
| Topic → Characters | **No navigation.** `setStep("characters")` is a state change only. `instructions` ref updates but no new `session.update` is sent. Agent must be told via a synthetic user message. |
| Language switch | Explicit reconnect → session restarts with new instructions. |
| Reconnect / retry | Session restarts, re-reads `instructionsRef.current` at connection time. |

**Implication:** The system prompt is effectively set **once per connection**. Mid-session state changes (topic → characters, user clicking UI) must be communicated via `sendUserMessage` (synthetic user turns injected into the conversation history).

---

## Tool set

### Phase: Landing
| Tool | Args | Returns | UI effect |
|------|------|---------|-----------|
| `begin_setup` | — | ok | Navigate to topic step |
| `remember_visitor_name` | `name` | `{ name }` | Store visitor name |
| `switch_language` | `language` (enum) | ok (suppress continuation) | Reconnect with new language |

### Phase: Topic selection
| Tool | Args | Returns | UI effect |
|------|------|---------|-----------|
| `select_topic` | `title` (enum of topic titles) | `{ title, description }` | Highlight topic card in UI; agent then explains |
| `confirm_topic` | — | `{ title }` or error if nothing selected | Advance to food selection step |
| `set_custom_topic` | `text` | `{ text }` | Select custom topic card, fill text |
| `current_topic` | — | `{ title }` or `{ none: true }` | No UI change; informs agent |

### Phase: Food selection
| Tool | Args | Returns | UI effect |
|------|------|---------|-----------|
| `select_character` | `name` (enum of character names) | `{ name, description }` | Select card + highlight hover |
| `deselect_character` | `name` (enum of character names) | `{ name }` | Deselect card, clear hover |
| `current_characters` | — | `{ selected: string[] }` | No UI change; informs agent |
| `human_panelist` | `name`, `description` | `{ index, name }` or error | Add human panelist slot (web mode only) |
| `go_to_topic_step` | — | ok | Return to topic step |
| `start_meeting` | — | ok or error | Create meeting, navigate to council |

### All phases
`remember_visitor_name`, `switch_language` available throughout.

---

## Names vs IDs

Tool schemas use **character names and topic titles** (not internal IDs) as enum values, matching exactly what the agent sees in the prompt. The handler resolves name → ID internally.

`createSetupAgentTools` signature:
```typescript
createSetupAgentTools({ otherLanguages, topics, characters, isWebMode })
```

- `topics` → builds `enum` of topic titles for `select_topic`
- `characters` → builds `enum` of character names for `select_character` / `deselect_character`
- `isWebMode` → conditionally includes `human_panelist`

---

## Tool return values vs state sync messages

### Tool return values
Tool results are serialised as `JSON.stringify(result)` by the protocol layer — this is the Inworld/OpenAI Realtime API convention. The model receives them as JSON strings. This is intentional and works well for structured data.

Keep tool return values as JSON objects with meaningful keys:
```json
{ "ok": true, "data": { "title": "Water Pollution", "description": "..." } }
{ "ok": false, "error": "No topic is selected yet." }
```

### State sync messages (`sendUserMessage`)
These are injected as plain user turns — the model treats them like messages the visitor typed.
Plain English works better here; JSON just creates noise the model has to parse.

Use readable sentences with a recognisable prefix:
```
STATE UPDATE: The visitor selected "Water Pollution" via the interface.
STATE UPDATE: The visitor confirmed "Water Pollution" and we moved to the food selection step.
```

(Phase 3 will update the existing JSON-encoded `STATE SYNC` messages to this plain-English format.)

---

## State sync — when user clicks the UI

The agent is not automatically notified when the user clicks something in the UI (topic card, continue button, etc.). These are communicated via `sendUserMessage` — a synthetic user turn injected into the conversation.

### Current events (topic step only)
- `topic_previewed` → user clicks a topic card (but hasn't confirmed)
- `topic_committed` → user clicks "Continue" on topic step

### Message format
Currently JSON-encoded and opaque. To be replaced with readable plain-English messages the agent can understand without special parsing. The prompt documents what these messages look like.

### What to send (and when)
Only send when there is a genuine state change the agent could not know about from its own tool calls.

| User action | Message to agent |
|-------------|-----------------|
| Clicks topic card | `STATE UPDATE: The visitor selected "[Topic]" via the interface.` |
| Clicks Continue on topic step | `STATE UPDATE: The visitor confirmed "[Topic]" and we moved to the food selection step.` |
| Clicks a character card | `STATE UPDATE: The visitor selected "[Name]" via the interface.` |

---

## Initial state in the prompt

When the agent connects (or reconnects mid-session), the prompt should reflect full current state so the agent starts correctly:

```
Current phase: characters
Currently selected topic: Water Pollution
Currently selected characters: Apple, Tomato, Bread
```

This means `buildSetupAgentPrompt` needs `selectedTopicTitle` and `selectedCharacterNames` in its params, read from the store in `MeetingSetupAgent`.

---

## Implementation phases

### Phase 1 — Tool set refactor ✅

Done. Tools match the table above; `createSetupAgentTools({ otherLanguages, topics, characters, isWebMode })`.

### Phase 2 — Initial state in prompt (partial)
- Add `selectedTopicTitle?` and `selectedCharacterNames?` to `SetupAgentPromptParams`
- Include in the "Current phase" section of the prompt
- `MeetingSetupAgent` reads `selectedTopic` + `selectedCharacters` from the store and passes them through
- Agent now starts correctly on reconnect/language-switch

### Phase 3 — UI-click state sync (open)
- Replace the JSON-encoded `STATE SYNC` messages with readable plain-English updates
- Add `human_interaction` section to the prompt explaining what these messages are
- Extend `MeetingSetupUserEvent` to cover character selection by user
- Only fire events for UI actions not already covered by tool return values
