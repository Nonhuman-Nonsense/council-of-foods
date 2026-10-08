# Council of Foods Server

## Overview
The backend server for the Council of Foods application, built with Node.js, Express, Socket.IO, and MongoDB. It manages the conversation flow, drives text and audio generation through the configured providers, and handles client connections.

## Testing
We utilize **Vitest** for unit and integration testing. There are three testing modes available to balance speed, cost, and realism.

### 1. Mock Mode (Default)
Runs tests using mocked OpenAI and Database services. This is the fastest and cheapest mode, ideal for local development and logic verification.
```bash
npm test
```

### 2. Fast Mode
Runs tests against the **Real OpenAI API** using faster/cheaper models (`gpt-4o-mini`).
- **Skips Audio Generation** to save time and bandwidth.
- Uses configuration from `test-options.json`.
- Requires `OPENAI_API_KEY` in `.env`.
```bash
npm run test:fast
```

### 3. Full Mode
Runs tests against the **Real OpenAI API** using production settings.
- **Generates Audio** (e.g., `tts-1` or `tts-1-hd`).
- Uses configuration from `global-options.json`.
- Tests full conversation lengths.
```bash
npm run test:full
```

## E2E Testing
End-to-End tests are located in the client directory but rely on the server running in test mode.
The `npm run e2e-server` script launches the server using `test-options.json`.

## Email and installations
Email goes through Brevo's transactional API (`MailService`), from `COUNCIL_MAIL_FROM`. The sender name ("Council of Foods") also titles the emails. Without `COUNCIL_BREVO_API_KEY` and `COUNCIL_MAIL_FROM`, nothing is emailed.

An installation's devices — the bridge on the museum Mac and the room power plugs — call `/api/installation/*` with one shared key, `X-Installation-Key` (`COUNCIL_INSTALLATION_KEY`, 16+ characters; unset → 503). Staff paste it on `#staff`, which hands it to the bridge, and into each plug's script.
- `GET /api/installation/venues` lists `COUNCIL_VENUES`, with addresses masked, so the bridge can check a venue the staff page hands it.
- `POST /api/installation/printer-alerts` emails a printer problem, reminder or test to the chosen venue's `alertEmails`, and sends a copy to ErrorBot. A recovery goes to ErrorBot only. It's rate-limited to 12 per venue per hour.
- `POST /api/installation/room-power`: see [Footprint meter](#footprint-meter).
- `POST /api/installation/network` stores the bridge's once-a-minute network samples (capped `network_samples` collection, 64 MB) and reports to ErrorBot when they show an internet outage of 2+ minutes. Read them with `npm run network -- --venue <id>`; see [MUSEUM.md](../MUSEUM.md#network-log).

Recipients only ever come from `COUNCIL_VENUES`, so the key can't be used to email anyone else. Venues are a JSON array (see `example.env`) and are validated at startup.

Venues are also what installations are tagged with: the staff page picks one from the public
`GET /api/venues` (ids and names only), and meetings, realtime sessions, the footprint meter
(`?venue=`) use its id. Unknown venue ids are dropped from meetings; without `COUNCIL_VENUES`
(local development) any well-formed id is accepted. A venue's `plugs` list the room power plugs
there now, by number; a plug at no venue is refused.

To try alerts locally without Brevo, leave the Brevo key unset: the alert endpoint answers 503. To send a real email to yourself, set a Brevo key and add a venue with your own address.

## Footprint meter

AI usage is recorded for the footprint meter (`/meter`); see
[docs/ai-footprint-meter.md](../docs/ai-footprint-meter.md). Room electricity comes from smart
plugs posting `POST /api/installation/room-power` with the installation key. Plug setup: [MUSEUM.md](../MUSEUM.md#room-power-plugs).
`npm run footprint:check` / `footprint:update` keep the EcoLogits table current (needs uv).

## Key Components
- **MeetingManager**: Orchestrates the meeting lifecycle, state, and event handling.
- **AudioSystem**: Manages queuing and generating audio (TTS).
- **SpeakerSelector**: Logic for determining the next speaker.
- **DialogGenerator**: Builds prompts and generates character responses, chair interjections, and summary documents. The conversation provider is configurable (`conversationModel` — Inworld or OpenAI direct), so nothing here is OpenAI-specific.

### Voice loudness
TTS voices come out at different levels, so every newly generated message is brought to one
integrated loudness (`voiceLoudness.targetLufs` in `global-options.json`) with a single gain for
the whole message and a peak limiter — a being's own dynamics, like a closing grunt,
keep their place. Corrections under `skipBelowDb` are left as generated, without a re-encode;
`null` switches it off. Audio already in the database is not changed. The measured level and the
gain are stored on each audio row as `loudness`.

`npm run voices:loudness -- [--lang <code>|all] [--takes 3] [--only id,id]` has every
being say the same lines through its real voice, prints each one's level and the gain it would
get, and saves the takes (as generated and normalized) to listen to. Use it to pick the target
and threshold.

### Empty generations
A model that returns nothing, or text that post-processing trims away entirely, is retried in one shared place (`completeWithRetry`) for every generation. Each failed attempt is reported to ErrorBot even when a retry rescues it, so a rare provider hiccup is visible rather than silent. Exhausting the attempts throws `EmptyCompletionError`, which is terminal for the meeting — deliberately: a missing chair line is not something to paper over.
