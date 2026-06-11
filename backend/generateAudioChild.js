const { EdgeTTS } = require('edge-tts');
const fs = require('fs');

const text = process.argv[2];
const voice = process.argv[3]; // We now expect a full voice identifier, e.g. "en-US-AriaNeural"
const filepath = process.argv[4];

if (!text || !voice || !filepath) {
    process.exit(1);
}

async function generate() {
    try {
        const tts = new EdgeTTS({
            voice: voice,
            lang: voice.split('-').slice(0, 2).join('-'), // e.g. "en-US"
            outputFormat: "audio-24khz-48kbitrate-mono-mp3"
        });

        await tts.ttsPromise(text, filepath);
        process.exit(0);
    } catch (e) {
        console.error("TTS generation failed:", e);
        process.exit(1);
    }
}

generate();