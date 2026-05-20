const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const gTTS = require('gtts');
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
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

    // Spawn a child process to generate the audio, so that if the `request` network stream
    // used internally by `gtts` emits an unhandled error (like ETIMEDOUT), it only crashes
    // the child process and leaves our main Express server running smoothly.

    const { spawn } = require('child_process');
    const child = spawn('node', ['generateAudioChild.js', text, lang, filepath], { cwd: __dirname });

    child.on('close', (code) => {
      if (code === 0) {
        res.json({ audioUrl: `/api/audio/${filename}` });
      } else {
        console.error(`gTTS child process exited with code ${code}. Likely a network timeout.`);
        res.status(500).json({ error: 'Failed to generate audio (Connection Error)' });
      }
    });

    child.on('error', (err) => {
      console.error('Failed to start gTTS child process:', err);
      res.status(500).json({ error: 'Failed to generate audio' });
    });

  } catch (error) {
    console.error('Error setting up gTTS:', error);
    res.status(500).json({ error: 'Failed to generate audio' });
  }
});

// Helper to wrap text for canvas, honoring newlines
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const paragraphs = text.split('\n');
  let currentY = y;

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i].trim();
    if (!p) {
      currentY += lineHeight; // Empty line for paragraph break
      continue;
    }

    const words = p.split(' ');
    let line = '';

    for(let n = 0; n < words.length; n++) {
      let testLine = line + words[n] + ' ';
      let testWidth = ctx.measureText(testLine).width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line.trim(), x, currentY);
        line = words[n] + ' ';
        currentY += lineHeight;
      }
      else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), x, currentY);
    currentY += lineHeight;
  }
  return currentY;
}

const ffprobePath = require('ffprobe-static').path;
ffmpeg.setFfprobePath(ffprobePath);

// Endpoint 2.5: Generate video
app.post('/api/generate-video', async (req, res) => {
  const { audioUrl, text } = req.body;

  if (!audioUrl || !text) {
    return res.status(400).json({ error: 'audioUrl and text are required' });
  }

  const audioFilename = audioUrl.split('/').pop();
  const audioFilePath = path.join(audioDir, audioFilename);

  if (!fs.existsSync(audioFilePath)) {
    return res.status(404).json({ error: 'Audio file not found' });
  }

  const videoFilename = `${uuidv4()}.mp4`;
  const videoFilePath = path.join(videoDir, videoFilename);

  try {
    // 1. Get Audio Duration
    const getAudioDuration = () => new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioFilePath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata.format.duration);
      });
    });

    let duration;
    try {
      duration = await getAudioDuration();
    } catch (err) {
      console.error("Could not read audio duration", err);
      return res.status(500).json({ error: 'Could not process audio track' });
    }

    // 2. Clean Text and Split into chunks
    // Remove markdown bolding and headings to prevent ugly rendering
    const cleanText = text.replace(/\*\*/g, '').replace(/#/g, '').trim();

    // Try to split by sentence/newline chunks to avoid cutting sentences midway
    const sentences = cleanText.split(/(?<=[.?!])\s+|\n+/);
    const slides = [];
    let currentSlide = '';
    const IDEAL_CHARS_PER_SLIDE = 250;

    for (const sentence of sentences) {
      if (!sentence.trim()) continue;

      if ((currentSlide.length + sentence.length) > IDEAL_CHARS_PER_SLIDE && currentSlide.length > 0) {
        slides.push(currentSlide.trim());
        currentSlide = sentence + ' ';
      } else {
        currentSlide += sentence + ' ';
      }
    }
    if (currentSlide.trim()) {
      slides.push(currentSlide.trim());
    }

    // Calculate total character count to allocate duration proportionally
    const totalChars = slides.reduce((sum, slide) => sum + slide.length, 0);

    // 3. Generate slide images
    const slidePaths = [];
    const listFilePath = path.join(videoDir, `${uuidv4()}_list.txt`);
    let listContent = '';

    for (let i = 0; i < slides.length; i++) {
      const slideText = slides[i];
      const canvas = createCanvas(1280, 720);
      const ctx = canvas.getContext('2d');

      // Background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 1280, 720);

      // Text styling
      ctx.fillStyle = '#ffffff';
      ctx.font = '36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Wrap text logic to compute height
      const paragraphs = slideText.split('\n');
      let lines = 0;
      const maxWidth = 1000;
      for (const p of paragraphs) {
        if (!p.trim()) {
          lines++;
          continue;
        }
        const slideWords = p.trim().split(' ');
        let lineText = '';
        lines++; // start first line of paragraph
        for (let n = 0; n < slideWords.length; n++) {
          let testLine = lineText + slideWords[n] + ' ';
          let testWidth = ctx.measureText(testLine).width;
          if (testWidth > maxWidth && n > 0) {
            lines++;
            lineText = slideWords[n] + ' ';
          } else {
            lineText = testLine;
          }
        }
      }

      const lineHeight = 50;
      const totalHeight = lines * lineHeight;
      let startY = (720 - totalHeight) / 2;
      // Adjust startY if it overflows top to at least have some padding
      if (startY < 50) startY = 50;

      ctx.textAlign = 'center';
      wrapText(ctx, slideText, 640, startY, maxWidth, lineHeight);

      // Save slide to disk
      const slideFilename = `${uuidv4()}_slide.jpg`;
      const slideFilePath = path.join(videoDir, slideFilename);
      const buffer = canvas.toBuffer('image/jpeg');
      fs.writeFileSync(slideFilePath, buffer);

      slidePaths.push(slideFilePath);

      // Append to ffmpeg concat list file format
      // Proportional duration based on slide character length
      let slideDuration = duration * (slideText.length / totalChars);
      if (slideDuration < 1.5) slideDuration = 1.5; // guarantee minimum 1.5s reading time

      listContent += `file '${slideFilePath.replace(/\\/g, '/')}'\n`;
      listContent += `duration ${slideDuration.toFixed(2)}\n`;
    }

    // FFmpeg requires the last file to be repeated without duration
    listContent += `file '${slidePaths[slidePaths.length - 1].replace(/\\/g, '/')}'\n`;

    fs.writeFileSync(listFilePath, listContent);

    // 4. Generate video by combining slides and audio
    ffmpeg()
      .input(listFilePath)
      .inputOptions(['-f concat', '-safe 0'])
      .input(audioFilePath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-pix_fmt', 'yuv420p',
        '-shortest'
      ])
      .save(videoFilePath)
      .on('end', () => {
        // Cleanup all temporary slide images and list file
        slidePaths.forEach(p => { try { fs.unlinkSync(p); } catch (e) {} });
        try { fs.unlinkSync(listFilePath); } catch (e) {}

        res.json({ videoUrl: `/api/video/${videoFilename}` });
      })
      .on('error', (err) => {
        console.error('Error generating video:', err);
        slidePaths.forEach(p => { try { fs.unlinkSync(p); } catch (e) {} });
        try { fs.unlinkSync(listFilePath); } catch (e) {}
        res.status(500).json({ error: 'Failed to generate video' });
      });
  } catch (error) {
    console.error('Error in video generation process:', error);
    res.status(500).json({ error: 'Failed to process video generation' });
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

// Update history entry
app.put('/api/history/:id', authMiddleware, (req, res) => {
  const { audioUrl, videoUrl } = req.body;
  const userId = req.user.id;
  const historyId = req.params.id;

  db.run(
    'UPDATE history SET audio_url = ?, video_url = ? WHERE id = ? AND user_id = ?',
    [audioUrl, videoUrl, historyId, userId],
    function(err) {
      if (err) {
        console.error('Error updating history:', err);
        return res.status(500).json({ error: 'Failed to update history' });
      }
      res.json({ message: 'History updated successfully' });
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