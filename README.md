# EduAI: Interactive Educational Video Generator

This is a full-stack web application that takes a short text input, expands it into a detailed explanatory video using AI, and generates a downloadable interactive video experience for students to learn from.

## Features

- **AI Structured Output:** Uses the Gemini or Groq API to turn short prompts (e.g., "explain relativity") into detailed, educational slides and contextual interactive quizzes.
- **High-Quality Audio:** Uses Microsoft Edge Neural TTS (`edge-tts`) to generate natural, native-sounding voices for various languages, without transliteration.
- **Dynamic Slides:** Uses `node-canvas` and the `Pexels API` to programmatically render modern slides with abstract backgrounds, custom typography, and relevant stock photography.
- **Interactive Player:** A custom React component tracks playback and automatically pauses at critical moments to inject HTML overlay quizzes over the video to verify the user is learning.
- **PostgreSQL Database:** Powered by Prisma ORM for highly scalable user accounts, folder hierarchies, and history storage.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- A PostgreSQL Database (Supabase, Neon, or Local)
- A Groq or Gemini API Key (`GROQ_API_KEYS` / `GEMINI_API_KEYS`)
- A Pexels API Key (`PEXELS_API_KEY`)

## Setup Instructions

### 1. Backend Setup

The backend is built with Node.js and Express and communicates securely with the AI providers.

First, open a terminal (Command Prompt, PowerShell, or Mac Terminal) and navigate to the project folder. Then, go into the `backend` folder and install the necessary packages:

```bash
cd backend
npm install
```

**Step-by-Step: Adding your OpenAI API Key**

You must provide your OpenAI API key for the text expansion to work. Here is exactly how to do it:

1. **Get an API Key:** If you don't have one, go to the [OpenAI API Dashboard](https://platform.openai.com/api-keys), sign in, and click "Create new secret key". Copy that key.
2. **Locate the backend folder:** In your project directory, open the folder named `backend`.
3. **Create the file:** Inside the `backend` folder, create a brand new file. Name this file exactly `.env` (Notice the dot at the very beginning! There is no name before the dot, and no `.txt` at the end).
   - *If using VS Code:* Right-click inside the `backend` folder in the sidebar -> New File -> type `.env` and hit Enter.
   - *If using Mac/Linux Terminal:* Run `touch .env` inside the `backend` folder.
   - *If using Windows:* You can open Notepad, and when saving, choose "Save as type: All Files" and name it `.env`.
4. **Edit the file:** Open the newly created `.env` file in your text editor.
5. **Paste your keys:** Add the following necessary keys:

```env
PORT=3001
DATABASE_URL="postgresql://user:password@localhost:5432/mydb?schema=public"
JWT_SECRET="super_secret_key"
GROQ_API_KEYS="gsk_..."
GEMINI_API_KEYS="AI..."
PEXELS_API_KEY="your_pexels_key"
```

6. **Initialize Database:** Run Prisma to setup your local PostgreSQL database schema:
```bash
npx prisma db push
npx prisma generate
```

**Start the backend server:**

Once the database is ready, run the following command in the `backend` folder to start the server:

```bash
npm run dev
```

### 2. Frontend Setup

The frontend is built with React, Vite, and Tailwind CSS.

Open a new terminal window and navigate to the frontend directory:

```bash
cd frontend
npm install
```

*(Optional)* If your backend is running on a port other than `3001`, you can create a `.env` file in the `frontend` directory:

```env
VITE_API_BASE_URL=http://localhost:your_port
```

Start the Vite development server:

```bash
npm run dev
```

### 3. Usage

1. Open your browser and navigate to `http://localhost:5173` (or the URL provided by Vite).
2. Sign up or log into a new account.
3. Enter a short topic or upload a file in the text area.
4. Click **Expand Text** to let the AI process the document.
5. Set output format to "video", pick an Edge TTS neural voice, and click **Generate Video**.
6. Wait for the compilation, and then interact with the quizzes embedded inside the video!
