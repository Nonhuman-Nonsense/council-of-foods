# Council of Foods Server

## Overview
The backend server for the Council of Foods application, built with Node.js, Express, Socket.IO, and MongoDB. It manages the conversation flow, integrates with OpenAI API for text and audio generation, and handles client connections.

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

## Key Components
- **MeetingManager**: Orchestrates the meeting lifecycle, state, and event handling.
- **AudioSystem**: Manages queuing and generating audio (TTS).
- **SpeakerSelector**: Logic for determining the next speaker.
- **DialogGenerator**: Interfaces with OpenAI to generate character responses.
