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

dotenv.config();

const db = require('./db/index');
const authMiddleware = require('./middleware/auth');

ffmpeg.setFfmpegPath(ffmpegPath);

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
    try {
      const user = await db.user.create({
        data: {
          email,
          password: hashedPassword,
        },
      });

      const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: '7d' });
      res.status(201).json({ token, user: { id: user.id, email } });
    } catch (err) {
      console.error('Signup create user error:', err);
      if (err.code === 'P2002') {
        return res.status(400).json({ error: 'Email already exists' });
      }
      return res.status(500).json({ error: 'Failed to create user' });
    }
  } catch (error) {
    console.error('Signup outer error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  let { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  email = email.trim().toLowerCase();

  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
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

// Helper to compute height and potentially auto-scale font
function getWrappedLines(ctx, text, maxWidth, baseFont, boldFont) {
  const paragraphs = text.split('\n');
  const resultLines = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i].trim();
    if (!p) {
      resultLines.push({ text: '', isTitle: false });
      continue;
    }

    const isTitle = (i === 0);
    ctx.font = isTitle ? boldFont : baseFont;

    const words = p.split(' ');
    let line = '';

    for(let n = 0; n < words.length; n++) {
      let testLine = line + words[n] + ' ';
      let testWidth = ctx.measureText(testLine).width;
      if (testWidth > maxWidth && n > 0) {
        resultLines.push({ text: line.trim(), isTitle });
        line = words[n] + ' ';
      }
      else {
        line = testLine;
      }
    }
    resultLines.push({ text: line.trim(), isTitle });
  }
  return resultLines;
}

// Helper to wrap text for canvas, honoring newlines and auto-fitting height
function wrapText(ctx, text, x, startYOriginal, maxWidth, baseLineHeight) {
  let fontSize = 36;
  let boldFontSize = 48;
  let lineHeight = baseLineHeight;
  let lines = [];
  let totalHeight = 0;

  // Try to fit the text within 620px of height (720 max - padding)
  const MAX_HEIGHT = 620;

  while (fontSize >= 18) {
    ctx.font = `${fontSize}px sans-serif`;
    lines = getWrappedLines(ctx, text, maxWidth, `${fontSize}px sans-serif`, `bold ${boldFontSize}px sans-serif`);

    totalHeight = 0;
    for (const line of lines) {
       totalHeight += line.isTitle ? (lineHeight * (boldFontSize/fontSize)) : lineHeight;
    }

    if (totalHeight <= MAX_HEIGHT) {
      break;
    }

    // Reduce font sizes and try again
    fontSize -= 2;
    boldFontSize -= 2.66; // Maintain ratio
    lineHeight = fontSize * 1.4; // roughly 1.4em line height
  }

  let currentY = (720 - totalHeight) / 2;
  if (currentY < 50) currentY = 50;

  for (const line of lines) {
    if (!line.text) {
      currentY += lineHeight;
      continue;
    }

    if (line.isTitle) {
      ctx.font = `bold ${boldFontSize}px sans-serif`;
    } else {
      ctx.font = `${fontSize}px sans-serif`;
    }

    ctx.fillText(line.text, x, currentY);
    currentY += line.isTitle ? (lineHeight * (boldFontSize/fontSize)) : lineHeight;
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
  const prompt = `
You are an excellent university professor creating educational lecture slides for students.

The goal is to create slides that genuinely TEACH concepts, similar to real classroom lecture slides used by professors.

For each slide generate:

1. "slide_content"
- Create informative and educational slide content.
- Slides may contain:
  - concise explanations
  - bullet points
  - short paragraphs
  - formulas
  - examples
  - definitions
- The slide itself should already help a student understand the topic even without narration.
- However, avoid making slides excessively crowded or unreadable.
- Structure the content clearly and naturally.
- Use line breaks appropriately.
- Prefer teaching clarity over presentation aesthetics.

2. "explanation_content"
- This is the spoken lecture narration.
- Expand naturally on the slide content like a professor teaching in class.
- Provide deeper intuition, reasoning, examples, analogies, step-by-step explanations, and context.
- Do NOT simply read the slide text.
- Add value beyond what is already written on the slide.
- Make the narration engaging and educational.

IMPORTANT:
- Slides should feel like real educational lecture slides.
- Maintain logical flow between slides.
- Each slide should continue naturally from the previous one.
- explanation_content should be more detailed than slide_content.
- Return ONLY valid JSON.
- Do NOT include markdown formatting.
- Escape all special characters properly.

Return format:

[
  {
    "slide_content": "Slide title\\n\\nExplanation points here...",
    "explanation_content": "Detailed spoken explanation..."
  }
]

User Topic/Text:
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
    slidesJsonStr = slidesJsonStr.replace(/```json/gi, '').replace(/```/g, '').trim();

    let slides;
    try {
      slides = JSON.parse(slidesJsonStr);
    } catch (err) {
      console.error("Failed to parse AI slide generation:", err);
      // Fallback: single slide
      slides = [{
        slide_content: text.substring(0, 100) + '...',
        explanation_content: text
      }];
    }

    if (!Array.isArray(slides) || slides.length === 0) {
      return res.status(500).json({ error: 'Failed to generate slides' });
    }

    // 2. Generate audio and image for each slide
    let videoListContent = '';
    let audioListContent = '';
    let totalAudioDuration = 0;

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const explanationText = slide.explanation_content || slide.explanation_text || ' ';
      const slideText = slide.slide_content || slide.slide_text || ' ';

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
      totalAudioDuration += duration;

      // Generate Image
      const canvas = createCanvas(1280, 720);
      const ctx = canvas.getContext('2d');

      // Background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 1280, 720);

      // Text styling
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      const maxWidth = 1000;
      const baseLineHeight = 50;

      // Draw text left-aligned with a left margin of 140 and auto-fit font
      wrapText(ctx, slideText, 140, 0, maxWidth, baseLineHeight);

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
        .outputOptions(['-c:a libmp3lame']) // Re-encode to fix padding/duration issues in concat
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
          `-t ${totalAudioDuration.toFixed(2)}` // Explicitly stop exactly when audio sum finishes
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
app.post('/api/history', authMiddleware, async (req, res) => {
  const { title, text, audioUrl, videoUrl } = req.body;
  const userId = req.user.id;

  if (!title && !text) {
    return res.status(400).json({ error: 'Title or text is required' });
  }

  try {
    const historyItem = await db.history.create({
      data: {
        userId,
        title: title || 'Untitled',
        text,
        audioUrl,
        videoUrl,
      },
    });

    res.status(201).json(historyItem);
  } catch (err) {
    console.error('Error saving history:', err);
    res.status(500).json({ error: 'Failed to save history' });
  }
});

// Update history entry
app.put('/api/history/:id', authMiddleware, async (req, res) => {
  const { audioUrl, videoUrl } = req.body;
  const userId = req.user.id;
  const historyId = Number(req.params.id);

  try {
    const updated = await db.history.updateMany({
      where: {
        id: historyId,
        userId,
      },
      data: {
        audioUrl,
        videoUrl,
      },
    });

    if (updated.count === 0) {
      return res.status(404).json({ error: 'History item not found' });
    }

    res.json({ message: 'History updated successfully' });
  } catch (err) {
    console.error('Error updating history:', err);
    res.status(500).json({ error: 'Failed to update history' });
  }
});

// Get user history
app.get('/api/history', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const rows = await db.history.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rows);
  } catch (err) {
    console.error('Error fetching history:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Default route
app.get('/', (req, res) => {
  res.send('Backend is running!');
});

app.listen(port, "0.0.0.0",() => {
  console.log(`Server running on port ${port}`);
});