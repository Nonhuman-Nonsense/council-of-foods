
import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

// Load env from .env file
dotenv.config({ path: '.env' });

async function timeGeminiTTS() {
    console.log("Timing Gemini 2.5 Flash TTS Latency...");

    const credsRelativePath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './google-credentials.json';
    const credsAbsolutePath = path.resolve(process.cwd(), credsRelativePath);

    if (!fs.existsSync(credsAbsolutePath)) {
        console.error("Credentials file not found!");
        return;
    }

    process.env.GOOGLE_APPLICATION_CREDENTIALS = credsAbsolutePath;

    try {
        const auth = new GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });
        const client = await auth.getClient();
        const token = await client.getAccessToken();

        const url = `https://texttospeech.googleapis.com/v1beta1/text:synthesize`;

        const textToSpeak = `As the essence of life that flows through every being, I welcome you to our gathering today.`;

        console.log(`Payload length: ${textToSpeak.length} characters.`);

        const body = {
            input: { text: textToSpeak },
            voice: {
                languageCode: 'en-US',
                name: 'Kore',
            },
            audioConfig: {
                audioEncoding: "MP3"
            }
        };

        (body.voice as any).model_name = 'gemini-2.5-flash-lite-preview-tts';

        const startTime = Date.now();
        console.log(`Sending request at ${new Date(startTime).toISOString()}...`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token.token}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`API Error: ${response.status} ${response.statusText}`);
            console.error(errText);
            return;
        }

        const data = await response.json() as any;
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        console.log(`Request completed at ${new Date(endTime).toISOString()}`);
        console.log(`Duration: ${duration.toFixed(3)} seconds`);

        if (data.audioContent) {
            console.log(`Received audio content (length: ${data.audioContent.length} chars).`);
        } else {
            console.log("No audio content received.");
        }

    } catch (error) {
        console.error("Script failed:", error);
    }
}

timeGeminiTTS();
