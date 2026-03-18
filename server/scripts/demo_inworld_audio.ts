
import fetch from 'node-fetch';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

// Load env from .env file
dotenv.config({ path: '.env' });

async function timeInworldTTS() {
    console.log("Timing Inworld AI TTS Latency...");

    const apiKey = process.env.INWORLD_API_KEY;
    if (!apiKey) {
        console.error("INWORLD_API_KEY not found in .env");
        return;
    }

    const url = 'https://api.inworld.ai/tts/v1/voice';

    // Using the same full text as other benchmarks
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

    const options = {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            "text": textToSpeak,
            "voice_id": "Dennis", // Using example voice 'Dennis'
            "audio_config": {
                "audio_encoding": "MP3",
                "speaking_rate": 1
            },
            "temperature": 1.0,
            "model_id": "inworld-tts-1"
        }),
    };

    try {
        const startTime = Date.now();
        console.log(`Sending request at ${new Date(startTime).toISOString()}...`);

        const response = await fetch(url, options);

        if (!response.ok) {
            const errText = await response.text();
            console.error(`API Error: ${response.status} ${response.statusText}`);
            console.error(errText);
            return; // Stop here
        }

        const result = await response.json() as any;
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        console.log(`Request completed at ${new Date(endTime).toISOString()}`);
        console.log(`Duration: ${duration.toFixed(3)} seconds`);

        if (result.audioContent) {
            const audioBuffer = Buffer.from(result.audioContent, 'base64');
            const outputPath = path.resolve(process.cwd(), 'inworld_sample.mp3');
            fs.writeFileSync(outputPath, audioBuffer);
            console.log(`Successfully saved audio to: ${outputPath}`);
            console.log(`File size: ${(audioBuffer.length / 1024).toFixed(2)} KB`);
        } else {
            console.log("No audio content received.");
        }

    } catch (error) {
        console.error("Script failed:", error);
    }
}

timeInworldTTS();
