const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const gTTS = require('gtts');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Set up OpenAI instance
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Ensure an audio directory exists
const audioDir = path.join(__dirname, 'audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir);
}

// Endpoint 1: Expand text
app.post('/api/expand-text', async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are an assistant that takes a short text and expands it into a full, detailed, and engaging explanatory text. Do not make it too long, but provide good context and explanation."
        },
        {
          role: "user",
          content: text
        }
      ],
      temperature: 0.7,
    });

    const expandedText = response.choices[0].message.content;
    res.json({ expandedText });
  } catch (error) {
    console.error("Error expanding text:", error);
    res.status(500).json({ error: 'Failed to expand text' });
  }
});

// Endpoint 2: Generate audio
app.post('/api/generate-audio', (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    const gtts = new gTTS(text, 'en');
    const filename = `${uuidv4()}.mp3`;
    const filepath = path.join(audioDir, filename);

    gtts.save(filepath, (err, result) => {
      if (err) {
        console.error("Error generating audio:", err);
        return res.status(500).json({ error: 'Failed to generate audio' });
      }

      // We will send the URL/path where the audio can be fetched
      res.json({ audioUrl: `/api/audio/${filename}` });
    });
  } catch (error) {
    console.error("Error setting up gTTS:", error);
    res.status(500).json({ error: 'Failed to generate audio' });
  }
});

// Endpoint 3: Serve the audio file
app.get('/api/audio/:filename', (req, res) => {
  const { filename } = req.params;

  // Securely serve the file by ensuring it stays within the audio directory
  res.sendFile(filename, { root: audioDir }, (err) => {
    if (err) {
      if (err.status !== 404) console.error("Error serving file:", err);
      res.status(err.status || 500).end();
    }
  });
});

// Default route
app.get('/', (req, res) => {
  res.send('Backend is running!');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
