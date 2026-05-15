const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const gTTS = require('gtts');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Set up Gemini instance
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Use Gemini Pro model
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
});

// Ensure audio directory exists
const audioDir = path.join(__dirname, 'audio');

if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir);
}
async function testGemini() {
  const result = await model.generateContent("Hello");
  console.log(result.response.text());
}

testGemini();
// Endpoint 1: Expand text
app.post('/api/expand-text', async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({
      error: 'Text is required',
    });
  }

  try {
    const prompt = `
You are an assistant that takes a short text and expands it into a full, detailed, and engaging explanatory text.

Do not make it too long, but provide good context and explanation.

Text:
${text}
`;

    const result = await model.generateContent(prompt);

    const response = await result.response;
    const expandedText = response.text();

    res.json({ expandedText });

  } catch (error) {
    console.error('Error expanding text:', error);

    res.status(500).json({
      error: 'Failed to expand text',
    });
  }
});

// Endpoint 2: Generate audio
app.post('/api/generate-audio', (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({
      error: 'Text is required',
    });
  }

  try {
    const gtts = new gTTS(text, 'en');

    const filename = `${uuidv4()}.mp3`;
    const filepath = path.join(audioDir, filename);

    gtts.save(filepath, (err) => {
      if (err) {
        console.error('Error generating audio:', err);

        return res.status(500).json({
          error: 'Failed to generate audio',
        });
      }

      res.json({
        audioUrl: `/api/audio/${filename}`,
      });
    });

  } catch (error) {
    console.error('Error setting up gTTS:', error);

    res.status(500).json({
      error: 'Failed to generate audio',
    });
  }
});

// Endpoint 3: Serve audio file
app.get('/api/audio/:filename', (req, res) => {
  const { filename } = req.params;

  res.sendFile(filename, { root: audioDir }, (err) => {
    if (err) {
      if (err.status !== 404) {
        console.error('Error serving file:', err);
      }

      res.status(err.status || 500).end();
    }
  });
});

// Default route
app.get('/', (req, res) => {
  res.send('Backend is running!');
});

app.listen(port, "0.0.0.0",() => {
  console.log(`Server running on port ${port}`);
});