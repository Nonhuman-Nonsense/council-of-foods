
import fetch from 'node-fetch';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

// Load env from .env file
dotenv.config({ path: '.env' });

async function verifyInworldTimings() {
    console.log("Verifying Inworld AI TTS Timings...");

    const apiKey = process.env.INWORLD_API_KEY;
    if (!apiKey) {
        console.error("INWORLD_API_KEY not found in .env");
        return;
    }

    const url = 'https://api.inworld.ai/tts/v1/voice';

    // Short text for verification
    const textToSpeak = "Hello world! This is a test of precise timings.";

    console.log(`Payload: "${textToSpeak}"`);

    const options = {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            "text": textToSpeak,
            "voice_id": "Dennis",
            "audio_config": {
                "audio_encoding": "MP3",
                "speaking_rate": 1
            },
            "temperature": 1.0,
            "model_id": "inworld-tts-1",
            "timestampType": "WORD" // The key feature!
        }),
    };

    try {
        const startTime = Date.now();
        console.log(`Sending request...`);

        const response = await fetch(url, options);

        if (!response.ok) {
            const errText = await response.text();
            console.error(`API Error: ${response.status} ${response.statusText}`);
            console.error(errText);
            return;
        }

        const result = await response.json() as any;
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        console.log(`Request completed in ${duration.toFixed(3)}s`);

        if (result.timestampInfo && result.timestampInfo.wordAlignment) {
            console.log("SUCCESS: Received Timestamp Info!");
            console.log(JSON.stringify(result.timestampInfo.wordAlignment, null, 2));

            // Validate if we actually got words
            const words = result.timestampInfo.wordAlignment.words;
            if (words && words.length > 0) {
                console.log(`Received ${words.length} words alignments.`);
            } else {
                console.warn("WARNING: timestampInfo present but words array is empty.");
            }

        } else {
            console.log("FAILURE: No timestampInfo received.");
            console.log("Response keys:", Object.keys(result));
        }

    } catch (error) {
        console.error("Script failed:", error);
    }
}

verifyInworldTimings();
