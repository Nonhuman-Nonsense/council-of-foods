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

## Email and installation bridges
Email goes through Brevo's transactional API (`MailService`), from `COUNCIL_MAIL_FROM`. The sender name ("Council of Foods") also titles the emails. Without `COUNCIL_BREVO_API_KEY` and `COUNCIL_MAIL_FROM`, nothing is emailed.

Museum installation bridges call `/api/bridge/*` with the shared `X-Bridge-Key` (`COUNCIL_BRIDGE_KEY`):
- `GET /api/bridge/venues` lists `COUNCIL_VENUES`, with addresses masked, for the staff page's venue picker.
- `POST /api/bridge/printer-alerts` emails a printer problem, reminder, recovery or test to the chosen venue's `alertEmails`, and sends a copy to ErrorBot. It's rate-limited to 12 per venue per hour.

Recipients only ever come from `COUNCIL_VENUES`, so the key can't be used to email anyone else. Venues are a JSON array (see `example.env`) and are validated at startup.

To try it locally without Brevo, leave the key unset: the alert endpoint answers 503. To send a real email to yourself, set a Brevo key and add a venue with your own address.

## Key Components
- **MeetingManager**: Orchestrates the meeting lifecycle, state, and event handling.
- **AudioSystem**: Manages queuing and generating audio (TTS).
- **SpeakerSelector**: Logic for determining the next speaker.
- **DialogGenerator**: Builds prompts and generates character responses, chair interjections, and summary documents. The conversation provider is configurable (`conversationModel` — Inworld or OpenAI direct), so nothing here is OpenAI-specific.

### Empty generations
A model that returns nothing, or text that post-processing trims away entirely, is retried in one shared place (`completeWithRetry`) for every generation. Each failed attempt is reported to ErrorBot even when a retry rescues it, so a rare provider hiccup is visible rather than silent. Exhausting the attempts throws `EmptyCompletionError`, which is terminal for the meeting — deliberately: a missing chair line is not something to paper over.
