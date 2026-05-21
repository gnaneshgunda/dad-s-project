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
  const { text, aiProvider, aiModel, language } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }

  const videoFilename = `${uuidv4()}.mp4`;
  const combinedAudioFilename = `${uuidv4()}.mp3`;
  const videoFilePath = path.join(videoDir, videoFilename);
  const combinedAudioFilePath = path.join(audioDir, combinedAudioFilename);

  // We'll store temporary paths to clean them up later
  const slidePaths = [];
  const audioPaths = [];
  const audioListFilePath = path.join(videoDir, `${uuidv4()}_audio_list.txt`);
  const videoListFilePath = path.join(videoDir, `${uuidv4()}_video_list.txt`);

  try {
    // 1. Generate JSON slides from the text
    const prompt = `You are a video presentation assistant. Given the following detailed text, break it down into logical presentation slides.
For each slide, provide:
1. "slide_text": A concise summary or bullet points suitable for a visual slide (max 150 characters). Do not use markdown bolding or complex formatting.
2. "explanation_text": The exact corresponding spoken explanation from the provided text. The explanation_text across all slides should piece together the entire original text or a very cohesive version of it.

Return ONLY a valid JSON array of objects with keys "slide_text" and "explanation_text".
Ensure it is strictly valid JSON without markdown wrapping (like \`\`\`json).

Text:
${text}
`;

    let slidesJsonStr = '';

    if (aiProvider === 'groq') {
      const groq = getNextGroqClient();
      const model = aiModel || 'llama-3.3-70b-versatile';
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: model,
      });
      slidesJsonStr = completion.choices[0]?.message?.content || '[]';
    } else {
      const modelName = aiModel || 'gemini-2.5-flash';
      const currentModel = getNextGeminiModel(modelName);
      const result = await currentModel.generateContent(prompt);
      slidesJsonStr = await result.response.text();
    }

    // Clean potential markdown blocks
    slidesJsonStr = slidesJsonStr.replace(/^```json/m, '').replace(/^```/m, '').trim();

    let slides;
    try {
      slides = JSON.parse(slidesJsonStr);
    } catch (err) {
      console.error("Failed to parse AI slide generation:", err);
      // Fallback: single slide
      slides = [{
        slide_text: text.substring(0, 100) + '...',
        explanation_text: text
      }];
    }

    if (!Array.isArray(slides) || slides.length === 0) {
      return res.status(500).json({ error: 'Failed to generate slides' });
    }

    // 2. Generate audio and image for each slide
    let videoListContent = '';
    let audioListContent = '';

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const explanationText = slide.explanation_text || ' ';
      const slideText = slide.slide_text || ' ';

      // Generate Audio
      const slideAudioFilename = `${uuidv4()}_slide.mp3`;
      const slideAudioFilePath = path.join(audioDir, slideAudioFilename);

      const lang = language || 'en';

      await new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        const child = spawn('node', ['generateAudioChild.js', explanationText, lang, slideAudioFilePath], { cwd: __dirname });
        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error('Audio generation failed'));
        });
        child.on('error', reject);
      });

      audioPaths.push(slideAudioFilePath);
      audioListContent += `file '${slideAudioFilePath.replace(/\\/g, '/')}'\n`;

      // Get Audio Duration
      const getAudioDuration = () => new Promise((resolve, reject) => {
        ffmpeg.ffprobe(slideAudioFilePath, (err, metadata) => {
          if (err) reject(err);
          else resolve(metadata.format.duration);
        });
      });

      let duration = await getAudioDuration();
      if (duration < 1.0) duration = 1.0;

      // Generate Image
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
        lines++;
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
      if (startY < 50) startY = 50;

      ctx.textAlign = 'center';
      wrapText(ctx, slideText, 640, startY, maxWidth, lineHeight);

      const slideImageFilename = `${uuidv4()}_slide.jpg`;
      const slideImageFilePath = path.join(videoDir, slideImageFilename);
      const buffer = canvas.toBuffer('image/jpeg');
      fs.writeFileSync(slideImageFilePath, buffer);

      slidePaths.push(slideImageFilePath);

      videoListContent += `file '${slideImageFilePath.replace(/\\/g, '/')}'\n`;
      videoListContent += `duration ${duration.toFixed(2)}\n`;
    }

    videoListContent += `file '${slidePaths[slidePaths.length - 1].replace(/\\/g, '/')}'\n`;

    fs.writeFileSync(videoListFilePath, videoListContent);
    fs.writeFileSync(audioListFilePath, audioListContent);

    // 3. Combine Audio Files first
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(audioListFilePath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy'])
        .save(combinedAudioFilePath)
        .on('end', resolve)
        .on('error', reject);
    });

    // 4. Generate final video using concat images and combined audio
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(videoListFilePath)
        .inputOptions(['-f concat', '-safe 0'])
        .input(combinedAudioFilePath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-pix_fmt', 'yuv420p',
          '-shortest'
        ])
        .save(videoFilePath)
        .on('end', resolve)
        .on('error', reject);
    });

    // Cleanup
    slidePaths.forEach(p => { try { fs.unlinkSync(p); } catch (e) {} });
    audioPaths.forEach(p => { try { fs.unlinkSync(p); } catch (e) {} });
    try { fs.unlinkSync(videoListFilePath); } catch (e) {}
    try { fs.unlinkSync(audioListFilePath); } catch (e) {}

    res.json({
      videoUrl: `/api/video/${videoFilename}`,
      audioUrl: `/api/audio/${combinedAudioFilename}` // return the combined audio too!
    });

  } catch (error) {
    console.error('Error in video generation process:', error);
    // Cleanup on error
    slidePaths.forEach(p => { try { fs.unlinkSync(p); } catch (e) {} });
    audioPaths.forEach(p => { try { fs.unlinkSync(p); } catch (e) {} });
    try { fs.unlinkSync(videoListFilePath); } catch (e) {}
    try { fs.unlinkSync(audioListFilePath); } catch (e) {}
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