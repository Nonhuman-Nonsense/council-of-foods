/**
 * Script to generate real OGG/OPUS test fixtures from Inworld API.
 * Run this manually when you need to refresh test audio files:
 * 
 * node --loader ts-node/esm scripts/generate-test-audio-fixtures.ts
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INWORLD_API_KEY = process.env.INWORLD_API_KEY;

if (!INWORLD_API_KEY) {
    console.error('ERROR: INWORLD_API_KEY environment variable not set');
    process.exit(1);
}

async function generateInworldAudio(text: string, voiceId: string): Promise<Buffer> {
    const url = 'https://api.inworld.ai/tts/v1/voice';

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${INWORLD_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            text: text,
            voice_id: voiceId,
            model_id: 'inworld-tts-1',
            temperature: 1.0,
            audio_config: {
                audio_encoding: "OGG_OPUS",
                speaking_rate: 1.0
            }
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Inworld API Error: ${response.status} ${errText}`);
    }

    const data: any = await response.json();
    if (!data.audioContent) {
        throw new Error('No audio content returned from Inworld');
    }

    return Buffer.from(data.audioContent, 'base64');
}

async function main() {
    console.log('Generating test audio fixtures from Inworld API...\n');

    const fixturesDir = path.join(__dirname, '../tests/fixtures');
    await fs.mkdir(fixturesDir, { recursive: true });

    // Generate two short audio clips for testing merging
    const fixtures = [
        {
            filename: 'test-chunk-1.ogg',
            text: 'This is the first test audio chunk.',
            voice: 'Wendy'
        },
        {
            filename: 'test-chunk-2.ogg',
            text: 'This is the second test audio chunk.',
            voice: 'Wendy'
        },
        {
            filename: 'test-chunk-3.ogg',
            text: 'And this is the third test audio chunk.',
            voice: 'Wendy'
        }
    ];

    for (const fixture of fixtures) {
        console.log(`Generating ${fixture.filename}...`);
        try {
            const audioBuffer = await generateInworldAudio(fixture.text, fixture.voice);
            const filepath = path.join(fixturesDir, fixture.filename);
            await fs.writeFile(filepath, audioBuffer);
            console.log(`✓ Saved ${fixture.filename} (${audioBuffer.length} bytes)\n`);
        } catch (error) {
            console.error(`✗ Failed to generate ${fixture.filename}:`, error);
            process.exit(1);
        }
    }

    console.log('All test fixtures generated successfully!');
    console.log(`Location: ${fixturesDir}`);
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
