
import OpenAI from "openai";
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

// Load env from .env file
dotenv.config({ path: '.env' });

async function timeOpenAITTS() {
    console.log("Timing OpenAI TTS Latency...");

    const apiKey = process.env.COUNCIL_OPENAI_API_KEY;
    if (!apiKey) {
        console.error("COUNCIL_OPENAI_API_KEY not found in .env");
        return;
    }

    const openai = new OpenAI({ apiKey });

    // Use "gpt-4o-audio-preview" or "gpt-4o-mini-audio-preview" if available.
    // Standard TTS endpoint uses tts-1 / tts-1-hd.
    // The user specifically asked for "gpt-4o-mini-tts", which implies the Audio Preview model.
    // Let's test the standard TTS endpoint first as it's the stable "TTS" solution, 
    // AND the Chat Completions Audio output if possible, but standard TTS is easier to compare directly.

    // UPDATE: Based on docs, "gpt-4o-mini-audio-preview-2024-12-17" supports audio.
    // However, for pure Text-to-Speech, the /v1/audio/speech endpoint with "tts-1" is the standard.
    // BUT the user asked for "gpt-4o-mini-tts".
    // I will try to use the chat completion with audio output first as that seems to be the "new" thing they want.

    const textToSpeak = `Dear esteemed members of the Council of Foods,
As the essence of life that flows through every being, I welcome you to our gathering today.
We are here to explore a topic of profound importance:
the impacts of industrial agriculture and food systems on agriculture-driven biodiversity loss.
Our discussion will encompass critical issues including monocultures, deforestation, desertification, and the biochemical repercussions of acidification and eutrophication, all intertwined with pesticide-driven ecosystem degradation.
Today, we will reflect on the ecological consequences of habitat destruction, understanding how they cascade through our global food systems, while navigating the intricate debates surrounding land use.
We will also consider solutions such as agroecology, crop diversification, and habitat restoration, emphasizing the urgent need for policy reforms that integrate biodiversity safeguarding into our food systems.
To frame our conversation, I offer the following questions for contemplation and discussion:
1. How do monocultures contribute to loss of biodiversity in our agricultural landscapes?
2. What are the broader ecological consequences of deforestation and desertification linked to industrial agriculture?
3. How do practices like eutrophication and acidification affect aquatic ecosystems and, subsequently, our food systems?`;

    console.log(`Payload length: ${textToSpeak.length} characters.`);

    // METHOD 1: Standard TTS (tts-1) - The reliable baseline
    try {
        console.log("\n--- Testing 'tts-1' (Standard OpenAI TTS) ---");
        const startTime = Date.now();
        console.log(`Sending request at ${new Date(startTime).toISOString()}...`);

        const response = await openai.audio.speech.create({
            model: "tts-1",
            voice: "alloy",
            input: textToSpeak,
            response_format: "mp3"
        });

        const buffer = Buffer.from(await response.arrayBuffer());
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        console.log(`Request completed at ${new Date(endTime).toISOString()}`);
        console.log(`Duration: ${duration.toFixed(3)} seconds`);

        const outputPath = path.resolve(process.cwd(), 'openai_tts1_sample.mp3');
        fs.writeFileSync(outputPath, buffer);
        console.log(`Saved: ${outputPath}`);

    } catch (e) {
        console.error("Standard TTS failed:", e);
    }

    // METHOD 2: GPT-4o Mini Audio (Chat Completions) - The new thing
    // Use raw fetch for this as the SDK definition might lag or need specific types
    try {
        console.log("\n--- Testing 'gpt-4o-mini' (Audio Output) ---");
        const url = "https://api.openai.com/v1/chat/completions";

        const body = {
            model: "gpt-4o-mini-audio-preview", // or gpt-4o-mini-realtime-preview
            modalities: ["text", "audio"],
            audio: { voice: "alloy", format: "mp3" },
            messages: [
                { role: "user", content: "Repeat the following text exactly: " + textToSpeak }
            ]
        };

        const startTime = Date.now();
        console.log(`Sending request at ${new Date(startTime).toISOString()}...`);

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const txt = await response.text();
            console.log("GPT-4o-mini Audio request failed (expected if model not public yet):", response.status);
            console.log(txt);
        } else {
            const data = await response.json() as any;
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;
            console.log(`Request completed at ${new Date(endTime).toISOString()}`);
            console.log(`Duration: ${duration.toFixed(3)} seconds`);

            if (data.choices[0].message.audio) {
                const audioData = data.choices[0].message.audio.data; // Base64
                const buffer = Buffer.from(audioData, 'base64');
                const outputPath = path.resolve(process.cwd(), 'openai_gpt4omini_sample.mp3');
                fs.writeFileSync(outputPath, buffer);
                console.log(`Saved: ${outputPath}`);
            }
        }

    } catch (e) {
        console.error("GPT-4o Audio failed:", e);
    }

}

timeOpenAITTS();
