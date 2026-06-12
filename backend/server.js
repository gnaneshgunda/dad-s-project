const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
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
const libraryRoutes = require('./routes/library');
const profileRoutes = require('./routes/profile');
const progressRoutes = require('./routes/progress');
const { resolveEdgeVoice, VOICES } = require('./lib/voices');
const { generateVideo } = require('./lib/videoGeneration');
const { createLlmCaller } = require('./lib/llmClient');
const { getLanguageInstruction } = require('./lib/llmPrompts');
const initCoursesRouter = require('./routes/courses');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();

const upload = multer({ dest: 'uploads/' });
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const port = process.env.PORT || 3001;

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // allow in dev; tighten in production via FRONTEND_URL
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'disconnected' });
  }
});
app.use('/api', libraryRoutes);
app.use('/api', profileRoutes);
app.use('/api', progressRoutes);

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

const callLlm = createLlmCaller({
  getNextGroqClient,
  getGroqKeyCount: () => groqApiKeys.length,
  getNextGeminiModel,
  getGeminiKeyCount: () => geminiApiKeys.length,
});
app.use('/api', initCoursesRouter({ callLlm, generateVideo, audioDir, videoDir }));

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
      if (err.code === 'P1001' || err.code === 'P2022') {
        return res.status(503).json({
          error: 'Database is not ready. Run: npx prisma db push — then restart the server.',
        });
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
app.post('/api/expand-text', authMiddleware, upload.single('file'), async (req, res) => {
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

    const languageInstruction = getLanguageInstruction(language);

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
app.post('/api/generate-audio', authMiddleware, (req, res) => {
  const { text, language } = req.body;

  if (!text) {
    return res.status(400).json({
      error: 'Text is required',
    });
  }

  try {
    const voice = resolveEdgeVoice(language);
    const filename = `${uuidv4()}.mp3`;
    const filepath = path.join(audioDir, filename);

    const { spawn } = require('child_process');
    const child = spawn('node', ['generateAudioChild.js', text, voice, filepath], { cwd: __dirname });

    child.on('close', (code) => {
      if (code === 0) {
        res.json({ audioUrl: `/api/audio/${filename}` });
      } else {
        console.error(`edge-tts child process exited with code ${code}.`);
        res.status(500).json({ error: 'Failed to generate audio (Edge TTS)' });
      }
    });

    child.on('error', (err) => {
      console.error('Failed to start edge-tts child process:', err);
      res.status(500).json({ error: 'Failed to generate audio' });
    });

  } catch (error) {
    console.error('Error setting up edge-tts:', error);
    res.status(500).json({ error: 'Failed to generate audio' });
  }
});

const ffprobePath = require('ffprobe-static').path;
ffmpeg.setFfprobePath(ffprobePath);

app.get('/api/voices', (_req, res) => {
  res.json(VOICES);
});

app.post('/api/generate-video', authMiddleware, async (req, res) => {
  const { text, aiProvider, aiModel, language, chapterId, title, promptType, originalTopic } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }

  if (!chapterId) {
    return res.status(400).json({ error: 'chapterId is required — save videos to a chapter folder' });
  }

  try {
    const chapter = await db.chapter.findFirst({
      where: { id: Number(chapterId), subject: { userId: req.user.id } },
    });
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    const result = await generateVideo({
      text,
      originalTopic: originalTopic || text,
      aiProvider,
      aiModel,
      language,
      promptType,
      audioDir,
      videoDir,
      callLlm,
    });

    const video = await db.video.create({
      data: {
        title: title || text.substring(0, 80) || 'Untitled Video',
        text,
        audioUrl: result.audioUrl,
        videoUrl: result.videoUrl,
        quizzesJson: result.quizzesJson,
        slidesJson: result.slidesJson,
        chapterId: chapter.id,
      },
    });

    res.json({
      videoUrl: result.videoUrl,
      audioUrl: result.audioUrl,
      interactiveQuizzes: result.interactiveQuizzes,
      videoId: video.id,
    });
  } catch (error) {
    console.error('Error in video generation process:', error);
    res.status(500).json({ error: 'Failed to process video generation' });
  }
});

// Endpoint 3: Serve audio file
app.options('/api/audio/:filename', (req, res) => res.sendStatus(204));
app.get('/api/audio/:filename', (req, res) => {
  const filepath = path.join(audioDir, path.basename(req.params.filename));
  if (!fs.existsSync(filepath)) return res.status(404).end();
  serveFileWithRange(req, res, filepath);
});

// Endpoint 4: Serve video file
app.options('/api/video/:filename', (req, res) => res.sendStatus(204));
app.get('/api/video/:filename', (req, res) => {
  const filepath = path.join(videoDir, path.basename(req.params.filename));
  if (!fs.existsSync(filepath)) return res.status(404).end();
  serveFileWithRange(req, res, filepath);
});

function serveFileWithRange(req, res, filepath) {
  const stat = fs.statSync(filepath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const ext = path.extname(filepath).toLowerCase();
  const mimeTypes = { '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.webm': 'video/webm' };
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  const corsHeaders = {
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
  };

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      ...corsHeaders,
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    });
    fs.createReadStream(filepath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      ...corsHeaders,
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filepath).pipe(res);
  }
}

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

async function startServer() {
  try {
    await db.$connect();
    await db.$queryRaw`SELECT 1`;
    console.log('Database connected');
  } catch (err) {
    console.error('Database connection failed:', err.message);
    console.error('Run: npx prisma db push');
  }

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
    console.log('Keep this terminal open while using the app.');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Run: npx kill-port ${port}`);
    } else {
      console.error('Server error:', err.message);
    }
    process.exit(1);
  });
}

startServer();