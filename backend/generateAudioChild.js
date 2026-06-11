const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const fs = require('fs');

const text = process.argv[2];
const voice = process.argv[3];
const filepath = process.argv[4];

if (!text || !voice || !filepath) {
    process.exit(1);
}

async function generate() {
    try {
        const tts = new MsEdgeTTS();
        await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        const { audioStream } = tts.toStream(text);
        const writeStream = fs.createWriteStream(filepath);
        await new Promise((resolve, reject) => {
            audioStream.pipe(writeStream);
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
            audioStream.on('error', reject);
        });
        process.exit(0);
    } catch (e) {
        console.error("TTS generation failed:", e);
        process.exit(1);
    }
}

generate();
