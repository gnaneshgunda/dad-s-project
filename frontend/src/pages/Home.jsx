import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Play, Pause, Download, Loader2, Upload, Video } from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';

function Home() {
  const [inputType, setInputType] = useState('text'); // 'text' or 'file'
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  const [promptType, setPromptType] = useState('explain-detailed');
  const [textLanguage, setTextLanguage] = useState('en');
  const [aiProvider, setAiProvider] = useState('groq');
  const [aiModel, setAiModel] = useState('llama-3.3-70b-versatile');
  const [audioLanguage, setAudioLanguage] = useState('en');
  const [outputType, setOutputType] = useState('audio'); // 'audio' or 'video'

  const [expandedText, setExpandedText] = useState('');
  const [isExpanding, setIsExpanding] = useState(false);
  const [currentHistoryId, setCurrentHistoryId] = useState(null);

  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Audio Player State
  const waveformRef = useRef(null);
  const wavesurfer = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Initialize WaveSurfer when audio URL is set
  useEffect(() => {
    if (audioUrl && waveformRef.current) {
      if (wavesurfer.current) {
        wavesurfer.current.destroy();
      }

      wavesurfer.current = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#a78bfa', // Tailwind purple-400
        progressColor: '#7c3aed', // Tailwind purple-600
        cursorColor: '#5b21b6',
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height: 80,
      });

      // Need to define API_BASE_URL locally here as well since it's used before the component body definition
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
      wavesurfer.current.load(`${API_BASE_URL}${audioUrl}`);

      wavesurfer.current.on('ready', () => {
        wavesurfer.current.setPlaybackRate(playbackSpeed);
      });

      wavesurfer.current.on('play', () => setIsPlaying(true));
      wavesurfer.current.on('pause', () => setIsPlaying(false));
      wavesurfer.current.on('finish', () => setIsPlaying(false));

      return () => {
        if (wavesurfer.current) {
          wavesurfer.current.destroy();
        }
      };
    }
  }, [audioUrl]);

  // Update playback speed dynamically
  useEffect(() => {
    if (wavesurfer.current) {
      wavesurfer.current.setPlaybackRate(playbackSpeed);
    }
  }, [playbackSpeed]);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

  const handleExpandText = async () => {
    if (inputType === 'text' && !inputText.trim()) return;
    if (inputType === 'file' && !selectedFile) return;

    setIsExpanding(true);
    setExpandedText('');
    setAudioUrl('');
    setVideoUrl('');

    try {
      const formData = new FormData();
      if (inputType === 'text') {
        formData.append('text', inputText);
      } else {
        formData.append('file', selectedFile);
      }
      formData.append('promptType', promptType);
      formData.append('language', textLanguage);
      formData.append('aiProvider', aiProvider);
      formData.append('aiModel', aiModel);

      const response = await axios.post(`${API_BASE_URL}/api/expand-text`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const generatedText = response.data.expandedText;
      setExpandedText(generatedText);

      // Save to history immediately
      try {
        const token = localStorage.getItem('token');
        if (token) {
          const historyResponse = await axios.post(`${API_BASE_URL}/api/history`, {
            title: (inputType === 'text' ? inputText.substring(0, 50) : selectedFile?.name) || 'Generated Content',
            text: generatedText,
            audioUrl: '',
            videoUrl: ''
          }, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setCurrentHistoryId(historyResponse.data.id);
        }
      } catch (historyErr) {
        console.error('Failed to save initial history:', historyErr);
      }

    } catch (error) {
      console.error('Error expanding text:', error);
      alert('Failed to process input.');
    } finally {
      setIsExpanding(false);
    }
  };

  const handleGenerateMedia = async () => {
    if (!expandedText.trim()) return;
    setIsGeneratingMedia(true);
    try {
      // 1. Generate Audio
      const audioResponse = await axios.post(`${API_BASE_URL}/api/generate-audio`, {
        text: expandedText,
        language: audioLanguage
      });

      const generatedAudioUrl = audioResponse.data.audioUrl;
      setAudioUrl(generatedAudioUrl);

      // 2. Generate Video if requested
      let generatedVideoUrl = '';
      if (outputType === 'video') {
        const videoResponse = await axios.post(`${API_BASE_URL}/api/generate-video`, {
          audioUrl: generatedAudioUrl,
          text: expandedText
        });
        generatedVideoUrl = videoResponse.data.videoUrl;
        setVideoUrl(generatedVideoUrl);
      }

      // 3. Update existing History record with media URLs
      setIsSaving(true);
      const token = localStorage.getItem('token');
      if (token && currentHistoryId) {
        await axios.put(`${API_BASE_URL}/api/history/${currentHistoryId}`, {
          audioUrl: generatedAudioUrl,
          videoUrl: generatedVideoUrl
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }

    } catch (error) {
      console.error('Error generating media:', error);
      alert('Failed to generate media.');
    } finally {
      setIsGeneratingMedia(false);
      setIsSaving(false);
    }
  };

  const handleDownloadText = () => {
    const element = document.createElement("a");
    const file = new Blob([expandedText], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = "explanation.txt";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const togglePlayPause = () => {
    if (wavesurfer.current) {
      wavesurfer.current.playPause();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">
            Text to Explanatory Audio
          </h1>
          <p className="mt-4 text-lg text-gray-500">
            Enter a short text, let AI expand it into a detailed explanation, and then generate a downloadable audio.
          </p>
        </div>

        {/* Input Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">

          <div className="flex space-x-4 mb-4">
            <button
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md ${inputType === 'text' ? 'bg-purple-100 text-purple-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
              onClick={() => setInputType('text')}
            >
              Text Input
            </button>
            <button
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md ${inputType === 'file' ? 'bg-purple-100 text-purple-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
              onClick={() => setInputType('file')}
            >
              File Upload
            </button>
          </div>

          {inputType === 'text' ? (
            <div>
              <label htmlFor="inputText" className="block text-sm font-medium text-gray-700 mb-2">
                Your Short Text
              </label>
              <textarea
                id="inputText"
                rows="4"
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 p-3 border"
                placeholder="E.g., Explain how a black hole works..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload File (PDF or TXT)
              </label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                <div className="space-y-1 text-center">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="flex text-sm text-gray-600">
                    <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-purple-600 hover:text-purple-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-purple-500">
                      <span>Upload a file</span>
                      <input id="file-upload" name="file-upload" type="file" className="sr-only" accept=".pdf,.txt" onChange={(e) => setSelectedFile(e.target.files[0])} />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">PDF, TXT up to 10MB</p>
                  {selectedFile && <p className="text-sm font-medium text-purple-600 mt-2">Selected: {selectedFile.name}</p>}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">AI Provider</label>
              <select
                value={aiProvider}
                onChange={(e) => {
                  setAiProvider(e.target.value);
                  setAiModel(e.target.value === 'groq' ? 'llama-3.3-70b-versatile' : 'gemini-2.5-flash');
                }}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 p-2 border"
              >
                <option value="groq">Groq</option>
                <option value="gemini">Gemini</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">AI Model</label>
              <select
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 p-2 border"
              >
                {aiProvider === 'groq' ? (
                  <>
                    <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile</option>
                    <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant</option>
                    <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
                    <option value="gemma2-9b-it">Gemma 2 9B</option>
                  </>
                ) : (
                  <>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">AI Task</label>
              <select
                value={promptType}
                onChange={(e) => setPromptType(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 p-2 border"
              >
                <option value="explain-detailed">Detailed Explanation</option>
                <option value="explain-simple">Simple Explanation (Like I'm 5)</option>
                <option value="summarize">Summarize</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Text Output Language</label>
              <select
                value={textLanguage}
                onChange={(e) => setTextLanguage(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 p-2 border"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="te">Telugu</option>
                <option value="hi">Hindi</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleExpandText}
            disabled={isExpanding || (inputType === 'text' ? !inputText.trim() : !selectedFile)}
            className="mt-4 w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExpanding ? (
              <>
                <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" />
                Expanding Text...
              </>
            ) : (
              'Expand Text'
            )}
          </button>
        </div>

        {/* Expanded Text Section */}
        {expandedText && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 transition-all duration-500">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Expanded Explanation</h2>
            <div className="bg-gray-50 p-4 rounded-md text-gray-700 text-sm leading-relaxed mb-4 max-h-64 overflow-y-auto">
              {expandedText}
            </div>

            <div className="flex justify-between items-center mb-4">
              <button
                onClick={handleDownloadText}
                className="flex items-center text-sm text-purple-600 hover:text-purple-800 font-medium"
              >
                <Download className="h-4 w-4 mr-1" /> Download Text
              </button>
            </div>

            <div className="border-t border-gray-200 pt-4 mt-4">
              <h3 className="text-md font-medium text-gray-900 mb-3">Media Generation Options</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Output Format</label>
                  <select
                    value={outputType}
                    onChange={(e) => setOutputType(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 p-2 border"
                  >
                    <option value="audio">Audio Only</option>
                    <option value="video">Audio + Video (Slides)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Audio Language (Voice)</label>
                  <select
                    value={audioLanguage}
                    onChange={(e) => setAudioLanguage(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 p-2 border"
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="te">Telugu</option>
                    <option value="hi">Hindi</option>
                  </select>
                </div>
              </div>
              <button
                onClick={handleGenerateMedia}
                disabled={isGeneratingMedia}
                className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingMedia ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" />
                    Generating Media...
                  </>
                ) : (
                  `Generate ${outputType === 'video' ? 'Video' : 'Audio'}`
                )}
              </button>
            </div>
          </div>
        )}

        {/* Audio Player Section */}
        {audioUrl && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 transition-all duration-500">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Audio Player</h2>

            {/* Waveform Container */}
            <div
              ref={waveformRef}
              className="w-full bg-gray-50 rounded-lg p-2 mb-4 border border-gray-200 cursor-pointer"
            ></div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={togglePlayPause}
                  className="p-3 rounded-full bg-purple-100 text-purple-600 hover:bg-purple-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
                >
                  {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                </button>

                <div className="flex flex-col">
                  <label htmlFor="speed" className="text-xs text-gray-500 mb-1">Speed: {playbackSpeed}x</label>
                  <input
                    id="speed"
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.25"
                    value={playbackSpeed}
                    onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                    className="w-24 accent-purple-600"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                {videoUrl && (
                  <a
                    href={`${API_BASE_URL}${videoUrl}`}
                    download="explanation.mp4"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
                  >
                    <Video className="h-4 w-4 mr-2" />
                    Video
                  </a>
                )}
                <a
                  href={`${API_BASE_URL}${audioUrl}`}
                  download="explanation.mp3"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Audio
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Video Player Section */}
        {videoUrl && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 transition-all duration-500">
             <h2 className="text-lg font-medium text-gray-900 mb-4">Video Player</h2>
             <video
               src={`${API_BASE_URL}${videoUrl}`}
               controls
               className="w-full rounded-md shadow-sm"
             />
          </div>
        )}

      </div>
    </div>
  );
}

export default Home;
