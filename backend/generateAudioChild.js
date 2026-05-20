const gTTS = require('gtts');

const text = process.argv[2];
const lang = process.argv[3];
const filepath = process.argv[4];

if (!text || !lang || !filepath) {
    process.exit(1);
}

try {
    const gtts = new gTTS(text, lang);
    gtts.save(filepath, (err) => {
        if (err) {
            process.exit(1);
        } else {
            process.exit(0);
        }
    });
} catch (e) {
    process.exit(1);
}
