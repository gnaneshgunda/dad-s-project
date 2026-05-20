const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const gTTS = require('gtts');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const db = require('./db/index');
const authMiddleware = require('./middleware/auth');

ffmpeg.setFfmpegPath(ffmpegPath);

dotenv.config();

const app = express();

const upload = multer({ dest: 'uploads/' });
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Manage multiple API keys for Gemini
const geminiApiKeys = process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',') : (process.env.GEMINI_API_KEY ? [process.env.GEMINI_API_KEY] : []);
let currentGeminiKeyIndex = 0;

function getNextGeminiModel(modelName = 'gemini-2.5-flash') {
  if (geminiApiKeys.length === 0) throw new Error("GEMINI_API_KEY is not set.");
  const key = geminiApiKeys[currentGeminiKeyIndex].trim();
  currentGeminiKeyIndex = (currentGeminiKeyIndex + 1) % geminiApiKeys.length;
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({
    model: modelName,
  });
}

// Manage multiple API keys for Groq
const groqApiKeys = process.env.GROQ_API_KEYS ? process.env.GROQ_API_KEYS.split(',') : (process.env.GROQ_API_KEY ? [process.env.GROQ_API_KEY] : []);
let currentGroqKeyIndex = 0;

function getNextGroqClient() {
  if (groqApiKeys.length === 0) throw new Error("GROQ_API_KEY is not set.");
  const key = groqApiKeys[currentGroqKeyIndex].trim();
  currentGroqKeyIndex = (currentGroqKeyIndex + 1) % groqApiKeys.length;
  return new Groq({ apiKey: key });
}

// Ensure audio directory exists
const audioDir = path.join(__dirname, 'audio');

if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir);
}

// Ensure video directory exists
const videoDir = path.join(__dirname, 'video');
if (!fs.existsSync(videoDir)) {
  fs.mkdirSync(videoDir);
}
// Authentication Endpoints

app.post('/api/signup', async (req, res) => {
  let { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  email = email.trim().toLowerCase();

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (email, password) VALUES (?, ?)', [email, hashedPassword], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Email already exists' });
        }
        return res.status(500).json({ error: 'Failed to create user' });
      }

      const token = jwt.sign({ id: this.lastID, email }, JWT_SECRET, { expiresIn: '7d' });
      res.status(201).json({ token, user: { id: this.lastID, email } });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', (req, res) => {
  let { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  email = email.trim().toLowerCase();

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email } });
  });
});

// Endpoint 1: Expand text (and handle file uploads)
app.post('/api/expand-text', upload.single('file'), async (req, res) => {
  let { text, promptType, language, aiProvider, aiModel } = req.body;
  const file = req.file;

  if (!text && !file) {
    return res.status(400).json({ error: 'Text or file is required' });
  }

  let contentToExplain = text || '';

  try {
    if (file) {
      if (file.mimetype === 'application/pdf') {
        const pdfData = await pdfParse(fs.readFileSync(file.path));
        contentToExplain = pdfData.text;
      } else {
        contentToExplain = fs.readFileSync(file.path, 'utf8');
      }
      // Clean up uploaded file
      fs.unlinkSync(file.path);
    }

    let systemInstruction = '';
    if (promptType === 'summarize') {
      systemInstruction = 'You are an assistant that summarizes the provided text concisely while keeping the main points.';
    } else if (promptType === 'explain-simple') {
      systemInstruction = 'You are an assistant that explains the provided text very simply, as if explaining to a 5-year-old.';
    } else if (promptType === 'explain-detailed') {
      systemInstruction = 'You are an assistant that takes a short text or document content and expands it into a full, highly detailed, and engaging explanatory text.';
    } else {
      systemInstruction = 'You are an assistant that takes a short text or document content and expands it into a full, detailed, and engaging explanatory text. Do not make it too long, but provide good context and explanation.';
    }

    const languageInstruction = language && language !== 'en'
      ? ` Please output the final response completely in ${language}.`
      : ` Please output the final response in English.`;

    const prompt = `
${systemInstruction}${languageInstruction}

Text:
${contentToExplain}
`;

    let expandedText = '';

    if (aiProvider === 'groq') {
      const groq = getNextGroqClient();
      const model = aiModel || 'llama-3.3-70b-versatile';
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'user', content: prompt }
        ],
        model: model,
      });
      expandedText = completion.choices[0]?.message?.content || '';
    } else {
      // Default to gemini
      const modelName = aiModel || 'gemini-2.5-flash';
      const currentModel = getNextGeminiModel(modelName);
      const result = await currentModel.generateContent(prompt);
      const response = await result.response;
      expandedText = response.text();
    }

    res.json({ expandedText });

  } catch (error) {
    console.error('Error expanding text:', error);
    res.status(500).json({ error: 'Failed to expand text' });
  }
});

// Endpoint 2: Generate audio
app.post('/api/generate-audio', (req, res) => {
  const { text, language } = req.body;

  if (!text) {
    return res.status(400).json({
      error: 'Text is required',
    });
  }

  try {
    // Determine language, defaults to English
    const lang = language || 'en';
    const gtts = new gTTS(text, lang);

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

// Endpoint 2.5: Generate video
app.post('/api/generate-video', async (req, res) => {
  const { audioUrl, text } = req.body;

  if (!audioUrl || !text) {
    return res.status(400).json({ error: 'audioUrl and text are required' });
  }

  // Extract just the filename from the audioUrl (e.g., /api/audio/123.mp3 -> 123.mp3)
  const audioFilename = audioUrl.split('/').pop();
  const audioFilePath = path.join(audioDir, audioFilename);

  if (!fs.existsSync(audioFilePath)) {
    return res.status(404).json({ error: 'Audio file not found' });
  }

  const videoFilename = `${uuidv4()}.mp4`;
  const videoFilePath = path.join(videoDir, videoFilename);

  // Generate a basic video with a solid background and scrolling text or just centered text
  // Using ffmpeg drawtext filter
  // We'll wrap text a bit using regex
  const wrappedText = text.replace(/(?![^\n]{1,40}$)([^\n]{1,40})\s/g, '$1\n');

  // Escape for FFmpeg drawtext
  const escapedText = wrappedText
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');

  const blackBackgroundPath = path.join(__dirname, 'black_background.jpg');

  ffmpeg()
    .input(blackBackgroundPath)
    .loop(1)
    .input(audioFilePath)
    .videoCodec('libx264')
    .audioCodec('aac')
    .outputOptions([
      '-shortest', // Stop encoding when the shortest stream (audio) ends
      '-vf', `scale=1280:720,drawtext=text='${escapedText}':fontcolor=white:fontsize=24:x=(w-text_w)/2:y=(h-text_h)/2`
    ])
    .save(videoFilePath)
    .on('end', () => {
      res.json({ videoUrl: `/api/video/${videoFilename}` });
    })
    .on('error', (err) => {
      console.error('Error generating video:', err);
      res.status(500).json({ error: 'Failed to generate video' });
    });
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

// Endpoint 4: Serve video file
app.get('/api/video/:filename', (req, res) => {
  const { filename } = req.params;

  res.sendFile(filename, { root: videoDir }, (err) => {
    if (err) {
      if (err.status !== 404) {
        console.error('Error serving file:', err);
      }
      res.status(err.status || 500).end();
    }
  });
});

// History Endpoints

// Save to history
app.post('/api/history', authMiddleware, (req, res) => {
  const { title, text, audioUrl, videoUrl } = req.body;
  const userId = req.user.id;

  if (!title && !text) {
    return res.status(400).json({ error: 'Title or text is required' });
  }

  db.run(
    'INSERT INTO history (user_id, title, text, audio_url, video_url) VALUES (?, ?, ?, ?, ?)',
    [userId, title || 'Untitled', text, audioUrl, videoUrl],
    function(err) {
      if (err) {
        console.error('Error saving history:', err);
        return res.status(500).json({ error: 'Failed to save history' });
      }
      res.status(201).json({ id: this.lastID, message: 'Saved to history successfully' });
    }
  );
});

// Get user history
app.get('/api/history', authMiddleware, (req, res) => {
  const userId = req.user.id;

  db.all('SELECT * FROM history WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, rows) => {
    if (err) {
      console.error('Error fetching history:', err);
      return res.status(500).json({ error: 'Failed to fetch history' });
    }
    res.json(rows);
  });
});

// Default route
app.get('/', (req, res) => {
  res.send('Backend is running!');
});

app.listen(port, "0.0.0.0",() => {
  console.log(`Server running on port ${port}`);
});