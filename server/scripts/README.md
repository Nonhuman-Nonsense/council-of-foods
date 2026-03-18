# Audio Generation Scripts

This directory contains benchmarking scripts and reference implementations used to evaluate and select the best Text-to-Speech (TTS) provider for the Gemini Voice Latency Optimization task.

## Reference Implementations (Inworld AI)
These scripts demonstrate the chosen solution (**Inworld AI**) and should be used as references for implementation.

*   **`demo_inworld_audio.ts`**:
    *   **Purpose**: Demonstrates how to generate an MP3 audio file using the Inworld AI REST API.
    *   **Usage**: `npx tsx scripts/demo_inworld_audio.ts`
    *   **Key Feature**: Shows correct Auth headers and basic payload structure.
*   **`demo_inworld_timings.ts`**:
    *   **Purpose**: Demonstrates how to request and parse **word-level timings** (`timestampType: "WORD"`).
    *   **Usage**: `npx tsx scripts/demo_inworld_timings.ts`
    *   **Key Feature**: This is the *critical* logic for replacing OpenAI Whisper. It shows the JSON structure of the word alignment response.

## Benchmarks (Historical Context)
These scripts were used to measure the latency of different providers. They are kept for future performance comparisons.

*   `time_gemini_tts.ts`: Benchmarks the original Gemini 2.5 Flash TTS (~98s latency).
*   `time_chirp_tts.ts`: Benchmarks Google Chirp 3 HD (~13s latency).
*   `time_openai_tts.ts`: Benchmarks OpenAI `tts-1` (~12s latency).
*   `time_neural2_tts.ts`: Benchmarks Google Neural2 (~2.4s latency, rejected for quality).

## Setup
All scripts generally require:
1.  `.env` file in `server/` with appropriate keys (`INWORLD_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `COUNCIL_OPENAI_API_KEY`).
2.  Dependencies installed: `npm install` in `server/`.
