# EduAI: Interactive Educational Video Generator

> **Architecture Pattern:** Agentic Multi-Stage LLM Pipeline with Programmatic Media Synthesis

EduAI is a full-stack web application that converts any short text prompt or uploaded document into a fully narrated, interactive educational video — complete with embedded comprehension quizzes. The system is built around a **two-stage agentic LLM pipeline** that separates content strategy from content execution, enabling coherent, pedagogically sound video generation.

---

## Table of Contents

- [How It Works — High Level](#how-it-works--high-level)
- [Architecture Overview](#architecture-overview)
- [LLM Layer — Deep Dive](#llm-layer--deep-dive)
  - [Stage 1: Intent Classifier & Content Strategist](#stage-1-intent-classifier--content-strategist)
  - [Stage 2: Slide Writer & Quiz Generator](#stage-2-slide-writer--quiz-generator)
  - [Provider Routing & Key Rotation](#provider-routing--key-rotation)
  - [Resilient JSON Parsing](#resilient-json-parsing)
  - [Course Scope Classifier (optional)](#course-scope-classifier-optional)
- [Media Synthesis Pipeline](#media-synthesis-pipeline)
- [Job Queue & Concurrency](#job-queue--concurrency)
- [Interactive Player](#interactive-player)
- [Data Model](#data-model)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Setup Instructions](#setup-instructions)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)

---

## How It Works — High Level

```
User Prompt / Uploaded File
         │
         ▼
┌─────────────────────┐
│  Stage 1 — LLM      │  Content Strategist
│  Intent Classifier  │  → produces a "blueprint" JSON
│  (Groq / Gemini)    │    (slide plan, quiz plan, narration tone)
└─────────────────────┘
         │  blueprint JSON
         ▼
┌─────────────────────┐
│  Stage 2 — LLM      │  Slide Writer
│  Slide Generator    │  → executes blueprint into full slide content
│  (Groq / Gemini)    │    + quiz questions + answers
└─────────────────────┘
         │  slides[] + interactive_quizzes[]
         ▼
┌──────────────────────────────────────────┐
│  Per-Slide Media Synthesis (parallel)    │
│  ┌──────────┐  ┌────────────┐  ┌──────┐ │
│  │ Edge TTS │  │ Pexels API │  │Canvas│ │
│  │  (audio) │  │  (images)  │  │(JPEG)│ │
│  └──────────┘  └────────────┘  └──────┘ │
└──────────────────────────────────────────┘
         │  per-slide audio + JPEG frames
         ▼
┌─────────────────────┐
│  FFmpeg Assembly    │  concat audio → combine with video frames
│  → final .mp4       │  H.264 + AAC, ultrafast preset
└─────────────────────┘
         │  mp4 + quiz timestamps
         ▼
┌─────────────────────┐
│  Supabase Storage   │  (or local file serving fallback)
└─────────────────────┘
         │  public URL
         ▼
┌─────────────────────┐
│  React Interactive  │  video + overlay quizzes
│  Video Player       │  timed pause + resume
└─────────────────────┘
```

---

## Architecture Overview

This application uses what is formally called a **Decomposed / Chained LLM Pipeline** (also called a "multi-step agentic chain" or "prompt chaining" architecture). It deliberately splits a complex generation task into two LLM calls with structured JSON interfaces between them, rather than one monolithic prompt.

| Layer | Technology | Role |
|---|---|---|
| **LLM Orchestration** | `llmClient.js` + `llmPrompts.js` | Two-stage prompt chain with provider failover |
| **Job Queue** | `generationJobs.js` | In-memory bounded concurrency queue |
| **TTS Engine** | `edge-tts` (Microsoft Edge Neural) | Per-slide narration audio |
| **Image Sourcing** | Pexels API + procedural canvas fallback | Slide background imagery |
| **Slide Renderer** | `node-canvas` | Programmatic JPEG frame generation |
| **Video Assembly** | `fluent-ffmpeg` (FFmpeg) | Audio concat + video mux |
| **Storage** | Supabase Storage (with local fallback) | Public video/audio hosting |
| **Database** | PostgreSQL via Prisma ORM | Users, courses, videos, jobs |
| **API** | Express.js (v5) | REST endpoints |
| **Frontend** | React + Vite + Tailwind CSS | SPA with interactive video player |

---

## LLM Layer — Deep Dive

### Stage 1: Intent Classifier & Content Strategist

**File:** `backend/lib/llmPrompts.js` → `buildIntentClassifierPrompt()`

Before any slide content is written, the system sends the user's raw query to an LLM acting as a **content strategist**. This agent is tasked with deeply reasoning about:

- What the user actually wants (overview? deep-dive? how-to? answer to a specific question?)
- How many slides the topic genuinely needs (no padding, no under-coverage)
- Which slides benefit from real photography vs. pure text
- Narration length per slide (`short` / `medium` / `long`)
- Layout type per slide (`full-text`, `text-left-image-right`, `split-card`, `centered-hero`, etc.)
- Where to place quiz checkpoints (at genuine comprehension moments, not uniformly)
- The global narration tone (e.g. "rigorous professor", "encouraging coding coach")

The agent returns a **Blueprint JSON**:

```json
{
  "intent": "explain the concept of recursion with a real example",
  "language_code": "en",
  "narration_tone": "encouraging coding coach",
  "slide_plan": [
    {
      "slide_number": 1,
      "title": "What is Recursion?",
      "purpose": "Introduce the concept with a simple definition",
      "narration_length": "medium",
      "needs_image": false,
      "image_search_keyword": "",
      "layout_type": "full-text",
      "display_style": "bullets"
    },
    {
      "slide_number": 2,
      "title": "Factorial — A Classic Example",
      "purpose": "Show how a function calls itself with a worked example",
      "narration_length": "long",
      "needs_image": false,
      "layout_type": "full-text",
      "display_style": "code-block"
    }
  ],
  "quiz_plan": [
    {
      "pause_after_slide": 1,
      "question_hint": "Test understanding of the base case concept"
    }
  ]
}
```

**Why a separate Stage 1?** A single prompt asking the LLM to *simultaneously plan and write* all slides produces inconsistent narration lengths, random quiz placement, and layout decisions that don't form a coherent arc. Splitting planning from execution gives each stage a clear, focused task — the same principle as separating software design from implementation.

---

### Stage 2: Slide Writer & Quiz Generator

**File:** `backend/lib/llmPrompts.js` → `buildDynamicSlidePrompt()`

Stage 2 receives the approved blueprint and acts as a **disciplined slide writer**. It is explicitly instructed:

- Produce **exactly** N slides in the blueprint order — no additions, removals, or reordering
- Honor per-slide `layout_type`, `display_style`, and `narration_length` tier
- Write `narration_text` that *expands* beyond the display text (adds intuition, examples, analogies)
- Write `display_text` according to the specified display style:
  - `bullets` → 4–6 complete-sentence bullets, title on first line
  - `code-block` → code/pseudocode with `\n` line breaks
  - `item-card` → item name, definition, example, significance
  - `numbered-steps` → actionable, complete-sentence steps
  - `key-value` → `Term: explanation` per line
- Generate quizzes from the quiz plan (4 options, 0-based correct index)
- Apply language instruction — native script only, never transliteration

**Narration Length Tiers:**

| Tier | Word Count | Use Case |
|---|---|---|
| `short` | 60–100 words | Simple facts, transitions, summaries |
| `medium` | 130–180 words | Standard concept explanations |
| `long` | 200–260 words | Complex ideas, worked examples, deep dives |

Mode modifiers apply on top of tiers:

| Mode | Effect |
|---|---|
| `explain-detailed` | Full tier word count |
| `explain-simple` | ~30% reduction + simpler vocabulary + more analogies |
| `summarize` | Force `short` tier on ALL slides |

**Output JSON:**

```json
{
  "slides": [
    {
      "narration_text": "Recursion is a technique where a function solves a problem by calling itself...",
      "display_text": "What is Recursion?\n• A function that calls itself\n• Must have a base case to stop\n• Each call works on a smaller version of the problem",
      "slide_bg_color": "#1e3a5f",
      "layout_type": "full-text",
      "image_search_keyword": ""
    }
  ],
  "interactive_quizzes": [
    {
      "pause_after_slide": 1,
      "question": "What prevents a recursive function from running forever?",
      "options": ["A loop", "A base case", "A return value", "A parameter"],
      "correct_answer": 1
    }
  ]
}
```

---

### Provider Routing & Key Rotation

**File:** `backend/lib/llmClient.js`

The LLM layer uses a **cascading provider failover** pattern with round-robin key rotation:

```
callLlm(prompt, aiProvider, aiModel)
    │
    ├─ if provider == 'groq'
    │       ├─ Try primary model (llama-3.3-70b-versatile) across all Groq keys
    │       ├─ On rate-limit: Try fallback model (llama-3.1-8b-instant) across all keys
    │       └─ On total Groq exhaustion: Fall back to Gemini (gemini-2.5-flash)
    │
    └─ if provider == 'gemini'
            └─ Try gemini-2.5-flash across all Gemini keys
```

**Key rotation:** Multiple API keys can be provided as comma-separated values in `GROQ_API_KEYS` and `GEMINI_API_KEYS`. The system cycles through them round-robin on each 429 rate-limit error. This allows free-tier keys to cover each other's daily limits.

**Rate-limit detection** checks for `429`, `rate_limit`, `Rate limit`, or `tokens per day` in the error message — covering both Groq and Gemini error formats.

---

### Resilient JSON Parsing

**File:** `backend/lib/llmPrompts.js` → `parseSlideGenerationResponse()`

LLMs sometimes truncate long JSON responses mid-object. The parser uses a two-strategy approach:

1. **Strategy 1 (ideal path):** Direct `JSON.parse()` on the full response
2. **Strategy 2 (recovery):** A balanced-brace scanner that walks the raw string character-by-character, correctly handles escape sequences (`\\`), and extracts every *complete* slide object even if the array is truncated. Incomplete slides at the truncation boundary are silently dropped.

This means a response truncated after 7 of 10 slides still produces a 7-slide video instead of crashing.

---

### Course Scope Classifier (optional)

For curriculum-level generation (full courses), a third LLM call classifies the user's learning goal:

| Scope | Description | Lesson Count |
|---|---|---|
| `quick-lesson` | Single narrow concept | 1 video |
| `deep-dive` | One subtopic needing thorough coverage | 3–6 lessons |
| `full-course` | Broad mastery goal | 8–16 lessons |

The **Curriculum Architect** prompt then generates a structured module/lesson plan, which is stored as `curriculumJson` on the `Subject` model and used to queue individual video generation jobs per lesson.

---

## Media Synthesis Pipeline

**File:** `backend/lib/videoGeneration.js`

For each slide, the pipeline runs sequentially:

### 1. TTS Audio Generation
- Uses Microsoft Edge Neural TTS (`edge-tts`) via a **child process** to avoid event loop blocking
- Voice is resolved from the language code (e.g. `en-US-AriaNeural`, `te-IN-ShrutiNeural`, `hi-IN-SwaraNeural`)
- **Retry logic:** 2 retries with 1-second delay
- **Silent fallback:** If TTS fails after all retries, writes a minimal valid MPEG1 Layer3 silence frame (~2 seconds) so the pipeline continues rather than crashing

### 2. Audio Duration Detection
- `ffprobe` measures exact duration of each audio file
- Slide frame duration = audio duration (minimum 1.0 second)
- Cumulative `slideEndTimes[]` is used to anchor quiz timestamps

### 3. Slide Frame Rendering
**File:** `backend/lib/slideRenderer.js`

Each slide is rendered to a **960×540 JPEG** using `node-canvas`:

- **Background:** Multi-stop linear gradient + two radial accent glows derived from the AI-specified `slide_bg_color`
- **Text Card:** Glassmorphism card (`rgba(255,255,255,0.92)`) with rounded corners, drop shadow, and white border
- **Text Layout:** `fitTextLayout()` shrinks font sizes iteratively until all content fits within the card bounds. Title is rendered in bold, body in normal weight.
- **Image Layouts:** 5 layout modes — `text-left-image-right`, `text-right-image-left`, `split-card`, `centered-hero`, `full-text`
- **Indic Script Support:** Noto Sans Telugu and Noto Sans Devanagari fonts are registered with `node-canvas` for native Telugu and Hindi rendering

### 4. Stock Photo Sourcing
**File:** `backend/lib/stockPhotos.js`

- The Pexels API is queried with the `image_search_keyword` (always English, per prompt instruction)
- On Pexels failure or no result: falls back to a procedurally generated gradient canvas with concentric circle decorations
- Images are fetched with a 15-second timeout

### 5. FFmpeg Assembly
Two FFmpeg passes:

1. **Audio concat:** All per-slide MP3 files are concatenated into a single combined audio track (`libmp3lame`)
2. **Video mux:** Slide JPEG frames (with per-frame `duration` directives in the concat file) are muxed with the combined audio into an H.264 + AAC `.mp4`
   - Codec: `libx264`, pixel format `yuv420p`
   - Quality: `crf 28`, preset `ultrafast` (optimized for server speed over file size)
   - Single FFmpeg thread (`-threads 1`) to prevent CPU saturation when multiple jobs run in parallel

### 6. Storage
**File:** `backend/lib/storage.js`

- Uploads video and audio to Supabase Storage (public `videos` and `audio` buckets)
- If `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` are not set, or upload fails for any reason, **falls back gracefully** to local file serving via `/api/video/:filename` and `/api/audio/:filename` routes — the job always completes

---

## Job Queue & Concurrency

**File:** `backend/lib/generationJobs.js`

Video generation is CPU- and API-intensive. Running jobs in parallel exhausts Groq API keys and causes FFmpeg to fight for CPU. The system implements a **bounded in-memory FIFO queue**:

- **MAX_CONCURRENT = 2** — at most 2 jobs run simultaneously
- Additional jobs are placed in a `jobQueue[]` array with status `queued`
- When a running job finishes, `dequeueNext()` picks the next waiting job
- Progress is written to the `GenerationJob` DB record at most once every 4 seconds or when the step/percent changes by ≥5 points (throttled to avoid DB write storms)
- **Cancellation:** An in-memory `Set<jobId>` is checked at each pipeline stage boundary (between Stage 1, Stage 2, and before each slide render). Cancelled jobs are marked in DB; their chapter's `generationStatus` is reset to `planned` so the user can retry.

---

## Interactive Player

**File:** `frontend/src/components/InteractiveVideoPlayer.jsx`

A custom React video player built on the native `<video>` element:

- **Quiz timestamps** are embedded as `{ timestamp_seconds, question, options, correct_index }` objects
- On `timeupdate`, the player checks if the current time crossed any unanswered quiz timestamp (within a 0.75-second window)
- On trigger: video is paused, an overlay modal is rendered with the question and 4 options
- Users must answer before the video continues — but answered quizzes are never re-triggered (`everAnsweredRef`)
- **Seek protection:** clicking the progress bar into a region that skips an unanswered quiz triggers that quiz instead of seeking
- Diamond markers on the progress bar show quiz positions (amber = unanswered, green = answered)
- The player fires `onLessonComplete` when the video ends for the first time (used to mark `LessonProgress` in the DB)
- Supports fullscreen, mute, and download

---

## Data Model

**File:** `backend/prisma/schema.prisma`

```
User
 ├── Subject[]          (courses/subjects the user creates)
 │    └── Chapter[]     (individual lessons within a subject)
 │         ├── Video[]  (generated video records per chapter)
 │         └── GenerationJob[]
 ├── History[]          (quick-generate history, outside course system)
 ├── LessonProgress[]   (completed lesson tracking)
 └── GenerationJob[]

GenerationJob
 ├── status: pending | running | completed | failed | cancelled
 ├── progress: { step, percent } (JSON, throttled writes)
 └── resultJson: { videoUrl, audioUrl, quizzesJson, slidesJson, blueprintJson }
```

Key design decisions:
- `Subject.curriculumJson` stores the full LLM-generated curriculum as serialized JSON (avoids a complex normalized Module/Lesson schema for MVP)
- `Video.quizzesJson` and `Video.slidesJson` store the AI output blobs so they can be replayed without re-generation
- `GenerationJob` is decoupled from `Video` — a job can fail and be retried without orphaning the video record
- `Subject` supports forking via a self-referential `sourceSubjectId` for sharing/copying course templates

---

## Features

- **Two-Stage Agentic LLM Pipeline:** Separates content strategy (blueprint) from content execution (slide writing) for pedagogically coherent output
- **Multi-Provider AI with Automatic Failover:** Groq (Llama 3.3 70B → Llama 3.1 8B → Gemini 2.5 Flash fallback) with multi-key round-robin rotation
- **Multilingual Support:** Native script rendering for Telugu, Hindi, and any language via language-aware prompt engineering and Noto font registration
- **Neural TTS Narration:** Microsoft Edge neural voices, resolved from language code, with retry + silence fallback
- **Programmatic Slide Design:** `node-canvas` renders 960×540 slides with gradient backgrounds, glassmorphism cards, and 5 responsive layout modes
- **Stock Photography Integration:** Pexels API sourcing with procedural gradient fallback
- **FFmpeg Video Assembly:** Per-slide timed frames + concatenated audio → H.264/AAC MP4
- **Interactive Quiz Overlay:** Timed quiz pauses with seek protection, answer tracking, and lesson completion callbacks
- **Bounded Job Queue:** Max 2 concurrent video generations with FIFO overflow queue and per-job cancellation
- **Dual Storage:** Supabase Storage with automatic local file fallback
- **Course System:** Full curriculum generation (full-course / deep-dive / quick-lesson scopes) with per-lesson video generation jobs
- **PostgreSQL + Prisma:** Scalable relational schema for users, subjects, chapters, videos, jobs, and progress tracking

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- A PostgreSQL database (Supabase, Neon, or local)
- **Groq API Key** — [console.groq.com](https://console.groq.com) (free tier available)
- **Gemini API Key** — [aistudio.google.com](https://aistudio.google.com) (optional but recommended as fallback)
- **Pexels API Key** — [pexels.com/api](https://www.pexels.com/api/) (free)
- **Supabase Project** — [supabase.com](https://supabase.com) (optional; videos served locally if omitted)

---

## Setup Instructions

### 1. Backend

```bash
cd backend
npm install
```

Create `backend/.env` (see [Environment Variables](#environment-variables) below), then:

```bash
npx prisma db push      # push schema to your PostgreSQL database
npx prisma generate     # generate the Prisma client
npm run dev             # start the backend on port 3001
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev             # start Vite dev server on port 5173
```

If your backend runs on a port other than `3001`, create `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:3001
```

### 3. Usage

1. Open `http://localhost:5173` in your browser
2. Sign up or log in
3. Enter a topic (e.g. "explain how binary search trees work") or upload a PDF/text file
4. Select AI provider (Groq or Gemini), model, language, and output mode
5. Click **Generate Video** — the job is queued and progress is shown in real time
6. Watch the generated video with embedded interactive quizzes

---

## Environment Variables

```env
# Server
PORT=3001

# Database (PostgreSQL)
DATABASE_URL="postgresql://user:password@host:5432/mydb?schema=public"
DIRECT_URL="postgresql://user:password@host:5432/mydb?schema=public"

# Authentication
JWT_SECRET="your_jwt_secret_key"

# LLM Providers (comma-separated for multi-key rotation)
GROQ_API_KEYS="gsk_key1,gsk_key2,gsk_key3"
GEMINI_API_KEYS="AIzaSy...,AIzaSy..."

# Stock Photos
PEXELS_API_KEY="your_pexels_key"

# Cloud Storage (optional — omit for local file serving)
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_KEY="your_service_role_key"
```

---

## Deployment

The backend includes a `Dockerfile` for containerized deployment. The image uses Node.js, installs system dependencies for `node-canvas` (Cairo, Pango, libjpeg), and bundles `ffmpeg-static` and `ffprobe-static` so no system FFmpeg installation is required.

Recommended deployment targets:
- **Backend:** Railway, Render, Fly.io, or any Docker-compatible host
- **Frontend:** Vercel or Netlify (Vite static build)
- **Database:** Supabase (also provides Storage), Neon, or Railway PostgreSQL
