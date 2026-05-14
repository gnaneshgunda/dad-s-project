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

The backend is built with Node.js and Express and communicates securely with the OpenAI API.

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
5. **Paste your key:** Add the following text to the file. Make sure you replace `sk-proj-YourActualOpenAiKeyGoesHere` with the real key you copied from OpenAI. Do not put quotes around the key.

```env
# Your OpenAI API key goes here
OPENAI_API_KEY=sk-proj-YourActualOpenAiKeyGoesHere
PORT=3001
```

6. **Save:** Save the `.env` file.

**Start the backend server:**

Once the key is saved, run the following command in the `backend` folder to start the server:

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
