import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Play, Pause, Download, Loader2 } from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';

function App() {
  const [inputText, setInputText] = useState('');
  const [expandedText, setExpandedText] = useState('');
  const [isExpanding, setIsExpanding] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');

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

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  const handleExpandText = async () => {
    if (!inputText.trim()) return;
    setIsExpanding(true);
    setExpandedText('');
    setAudioUrl('');
    try {
      const response = await axios.post(`${API_BASE_URL}/api/expand-text`, {
        text: inputText,
      });
      setExpandedText(response.data.expandedText);
    } catch (error) {
      console.error('Error expanding text:', error);
      alert('Failed to expand text.');
    } finally {
      setIsExpanding(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!expandedText.trim()) return;
    setIsGeneratingAudio(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/generate-audio`, {
        text: expandedText,
      });
      setAudioUrl(response.data.audioUrl);
    } catch (error) {
      console.error('Error generating audio:', error);
      alert('Failed to generate audio.');
    } finally {
      setIsGeneratingAudio(false);
    }
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
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
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
          <button
            onClick={handleExpandText}
            disabled={isExpanding || !inputText.trim()}
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

            <button
              onClick={handleGenerateAudio}
              disabled={isGeneratingAudio}
              className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingAudio ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" />
                  Generating Audio...
                </>
              ) : (
                'Generate Audio'
              )}
            </button>
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

              <a
                href={`${API_BASE_URL}${audioUrl}`}
                download="explanation.mp3"
                target="_blank"
                rel="noreferrer"
                className="flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
              >
                <Download className="h-4 w-4 mr-2" />
                Download MP3
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
