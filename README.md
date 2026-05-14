# Text to Explanatory Audio Tool

This is a full-stack web application that takes a short text input, expands it into a detailed explanatory text using AI, and generates a downloadable audio file (Text-to-Speech) for the user to listen to.

## Features

- **AI Text Expansion:** Uses the OpenAI API to turn short prompts (e.g., "explain black holes") into detailed, engaging explanations.
- **Free Audio Generation:** Uses `gTTS` (Google Text-to-Speech) to generate free, downloadable MP3 audio files.
- **Advanced Audio Player:** Built with `wavesurfer.js`, featuring:
  - Interactive visual waveform
  - Click-to-seek functionality (propagate forward/backward)
  - Playback speed adjustment (0.5x to 2x)
  - Direct MP3 download

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- An [OpenAI API Key](https://platform.openai.com/api-keys)

## Setup Instructions

### 1. Backend Setup

The backend is built with Node.js and Express.

```bash
cd backend
npm install
```

Create a `.env` file in the `backend` directory and add your OpenAI API key:

```env
OPENAI_API_KEY=your_openai_api_key_here
PORT=3001
```

Start the backend server:

```bash
npm run dev
# or
npm start
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
2. Enter a short topic or question in the text area.
3. Click **Expand Text** to generate a detailed explanation.
4. Once the text is generated, click **Generate Audio**.
5. Use the audio player to listen to the explanation, adjust the playback speed, seek through the waveform, or download the MP3 file!
