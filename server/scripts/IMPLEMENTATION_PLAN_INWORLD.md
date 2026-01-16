# IMPEMENTATION PLAN: Inworld AI Text-to-Speech Integration

**Objective:**
Replace the latency-heavy Gemini TTS + Whisper implementation with **Inworld AI TTS** to achieve fast generation (~4s), native subtitle timings, and expressive voice capabilities.

## 1. Context & Decision
*   **Problem:** Previous Gemini Flash TTS implementation took ~98 seconds for a standard monologue and required a slow OpenAI Whisper step to generating timings.
*   **Optimization Search:** We benchmarked Gemini, Neural2, Chirp 3, OpenAI, and Inworld.
*   **Decision:** **Inworld AI** was selected because:
    *   **Speed:** ~4.1s generation time (vs ~13s for OpenAI/Chirp).
    *   **Price:** $5 / 1M characters (vs $15-$30).
    *   **Features:** Supports native `timestampType: "WORD"`, allowing us to skip Whisper entirely.
    *   **Expressiveness:** Supports inline audio markups (e.g., `emotion:happy`).

## 2. API Details
*   **Endpoint:** `https://api.inworld.ai/tts/v1/voice`
*   **Method:** `POST`
*   **Auth:** Basic Auth (Username: API Key, Password: empty/ignored? Actually usually `Basic base64(apiKey)`).
    *   *Note:* The existing `.env` has `INWORLD_API_KEY`. The working script `time_inworld_tts.ts` uses `Authorization: Basic ${apiKey}` directly. Please verify if the key in env is already base64 encoded or if it needs encoding. (The working script suggests it works as-is).
*   **Model:** `inworld-tts-1`
*   **Voice:** `Dennis` (or others like `Ronald`, etc.)

## 3. Implementation Steps

### Step 1: Update `AudioSystem.ts`
Location: `server/src/logic/AudioSystem.ts`

1.  **Remove** the `generateAudio` logic that calls Google Cloud TTS (Gemini) and OpenAI Whisper.
2.  **Implement** the Inworld API call.
    ```typescript
    const result = await fetch('https://api.inworld.ai/tts/v1/voice', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${process.env.INWORLD_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            text: text,
            voice_id: "Dennis", // Or configurable
            model_id: "inworld-tts-1",
            timestampType: "WORD", // CRITICAL for subtitles
            audio_config: { audio_encoding: "MP3" }
        })
    });
    ```
3.  **Map Timings**:
    *   Inworld returns `timestampInfo.wordAlignment`.
    *   The `AudioSystem` expects `SentenceTiming[]` (sentences with start/end times).
    *   **Logic**:
        *   You receive a list of words with `start` and `end`.
        *   You have the original text split into sentences (via `DialogGenerator`).
        *   You must map the word timings to the sentences.
        *   *Simpler Approach*: Since Inworld returns the *entire* audio for the *entire* text input, you can just return the raw word timings if the client supports it, OR reconstruct the sentence timings by finding the start of the first word of a sentence and the end of the last word.
        *   *Recommendation*: Iterate through the known sentences. specific matching words in the `words` array to reconstruct the `start` and `end` for each sentence.

### Step 2: Update Tests
Location: `server/tests/AudioSystemGemini.test.js` (Rename to `AudioSystemInworld.test.js`?)

1.  Mock the Inworld API response instead of Google/OpenAI.
2.  Verify that `generateAudio` correctly parses the `timestampInfo` and returns valid `SentenceTiming` objects.

## 4. Useful Resources (Left in `server/scripts`)
*   `scripts/demo_inworld_audio.ts`: A working script that generates audio from Inworld. Use this to verify your API connection.
*   `scripts/demo_inworld_timings.ts`: A working script that demonstrates how to request and parse `timestampType: "WORD"`. **Reference this for the timing logic.**
*   `scripts/time_openai_tts.ts` & others: Kept for performance comparison if needed.

## 5. Client
*   No changes required on the client side (`useCouncilMachine.ts`) as long as the server returns the populated `SentenceTiming[]` as before.
