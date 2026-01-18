
import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

// Load env from .env file
dotenv.config({ path: '.env' });

async function timeNeural2TTS() {
    console.log("Timing Neural2 TTS Latency...");

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

        const body = {
            input: { text: textToSpeak },
            voice: {
                languageCode: 'en-US',
                name: 'en-US-Neural2-F', // Standard Neural2 Voice
            },
            audioConfig: {
                audioEncoding: "MP3"
            }
        };

        // No model_name override needed for standard voices

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

timeNeural2TTS();
