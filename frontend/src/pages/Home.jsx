import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, Pause, Download, Loader2, Upload, FileText, Wand2,
  Sparkles, Globe, Mic, Lightbulb, BookOpen, Lock,
} from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';
import api from '../lib/api';
import { API_BASE_URL } from '../lib/config';
import InteractiveVideoPlayer from '../components/InteractiveVideoPlayer';
import DashboardStats from '../components/DashboardStats';
import StepProgress from '../components/StepProgress';
import Toast from '../components/Toast';
import ConfirmModal from '../components/ConfirmModal';
import PublicCourseModal from '../components/PublicCourseModal';
import { useGeneration } from '../context/GenerationContext';

const LEARNING_SCOPES = [
  { value: 'auto', label: 'Auto-detect', desc: 'AI picks the best approach' },
  { value: 'quick-lesson', label: 'Quick Lesson', desc: 'One video — narrow topics like "segment trees"' },
  { value: 'deep-dive', label: 'Deep Dive', desc: 'One thorough module — e.g. "pointers in C"' },
  { value: 'full-course', label: 'Full Course', desc: 'Multi-lesson path — e.g. "Learn C"' },
];

const PROMPT_TYPES = [
  { value: 'explain-detailed', label: 'Detailed Explanation', desc: 'In-depth, university-level' },
  { value: 'explain-simple', label: 'Simple (ELI5)', desc: 'Easy to understand' },
  { value: 'summarize', label: 'Summarize', desc: 'Key points only' },
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'te', label: 'Telugu (తెలుగు)' },
  { value: 'hi', label: 'Hindi (हिन्दी)' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
];

const TOPIC_SUGGESTIONS = [
  'How do black holes form?',
  'Explain photosynthesis simply',
  'What is machine learning?',
  'Newton\'s laws of motion',
];

export default function Home() {
  const navigate = useNavigate();
  const { trackJob } = useGeneration();
  const [inputType, setInputType] = useState('text');
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [promptType, setPromptType] = useState('explain-detailed');
  const [textLanguage, setTextLanguage] = useState('en');
  const [aiProvider, setAiProvider] = useState('groq');
  const [aiModel, setAiModel] = useState('llama-3.3-70b-versatile');
  const [audioLanguage, setAudioLanguage] = useState('en-US-AriaNeural');
  const [voices, setVoices] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedChapterId, setSelectedChapterId] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newChapterName, setNewChapterName] = useState('');
  const [outputType, setOutputType] = useState('video');
  const [learningScope, setLearningScope] = useState('auto');
  const [isPublic, setIsPublic] = useState(false);
  const [detectedScope, setDetectedScope] = useState(null);
  const [publicMatch, setPublicMatch] = useState(null);
  const [showPublicModal, setShowPublicModal] = useState(false);
  const [confirmQuick, setConfirmQuick] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [expandedText, setExpandedText] = useState(() => sessionStorage.getItem('expandedText') || '');
  const [isExpanding, setIsExpanding] = useState(false);
  const [currentHistoryId, setCurrentHistoryId] = useState(() => sessionStorage.getItem('currentHistoryId') || null);
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const [audioUrl, setAudioUrl] = useState(() => sessionStorage.getItem('audioUrl') || '');
  const [videoUrl, setVideoUrl] = useState(() => sessionStorage.getItem('videoUrl') || '');
  const [interactiveQuizzes, setInteractiveQuizzes] = useState(() => JSON.parse(sessionStorage.getItem('interactiveQuizzes') || '[]'));
  const [toast, setToast] = useState(null);

  const waveformRef = useRef(null);
  const wavesurfer = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const currentStep = useMemo(() => {
    if (videoUrl || audioUrl) return 3;
    if (expandedText) return 2;
    return 1;
  }, [videoUrl, audioUrl, expandedText]);

  useEffect(() => {
    api.get('/api/voices').then((res) => setVoices(res.data)).catch(() => {
      setVoices([
        { id: 'en-US-AriaNeural', label: 'English (US) — Aria' },
        { id: 'te-IN-ShrutiNeural', label: 'Telugu — Shruti' },
        { id: 'hi-IN-SwaraNeural', label: 'Hindi — Swara' },
      ]);
    });
    api.get('/api/subjects').then((res) => setSubjects(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedSubjectId) { setChapters([]); setSelectedChapterId(''); return; }
    api.get(`/api/subjects/${selectedSubjectId}/chapters`).then((res) => setChapters(res.data)).catch(() => {});
  }, [selectedSubjectId]);

  useEffect(() => { sessionStorage.setItem('interactiveQuizzes', JSON.stringify(interactiveQuizzes)); }, [interactiveQuizzes]);
  useEffect(() => { sessionStorage.setItem('expandedText', expandedText); }, [expandedText]);
  useEffect(() => {
    if (currentHistoryId) sessionStorage.setItem('currentHistoryId', currentHistoryId);
    else sessionStorage.removeItem('currentHistoryId');
  }, [currentHistoryId]);
  useEffect(() => { sessionStorage.setItem('audioUrl', audioUrl); }, [audioUrl]);
  useEffect(() => { sessionStorage.setItem('videoUrl', videoUrl); }, [videoUrl]);

  useEffect(() => {
    if (!audioUrl || !waveformRef.current) return;
    if (wavesurfer.current) wavesurfer.current.destroy();
    wavesurfer.current = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#a5b4fc',
      progressColor: '#6366f1',
      cursorColor: '#4f46e5',
      barWidth: 2, barGap: 1, barRadius: 2, height: 72,
    });
    wavesurfer.current.load(`${API_BASE_URL}${audioUrl}`);
    wavesurfer.current.on('ready', () => wavesurfer.current.setPlaybackRate(playbackSpeed));
    wavesurfer.current.on('play', () => setIsPlaying(true));
    wavesurfer.current.on('pause', () => setIsPlaying(false));
    wavesurfer.current.on('finish', () => setIsPlaying(false));
    return () => { if (wavesurfer.current) wavesurfer.current.destroy(); };
  }, [audioUrl]);

  useEffect(() => {
    if (wavesurfer.current) wavesurfer.current.setPlaybackRate(playbackSpeed);
  }, [playbackSpeed]);

  const handleCreateSubject = async () => {
    if (!newSubjectName.trim()) return;
    try {
      const res = await api.post('/api/subjects', { name: newSubjectName.trim() });
      setSubjects((prev) => [...prev, res.data]);
      setSelectedSubjectId(String(res.data.id));
      setNewSubjectName('');
      setToast({ message: 'Subject created!', type: 'success' });
    } catch { setToast({ message: 'Failed to create subject', type: 'error' }); }
  };

  const handleCreateChapter = async () => {
    if (!selectedSubjectId || !newChapterName.trim()) return;
    try {
      const res = await api.post(`/api/subjects/${selectedSubjectId}/chapters`, { name: newChapterName.trim() });
      setChapters((prev) => [...prev, res.data]);
      setSelectedChapterId(String(res.data.id));
      setNewChapterName('');
      setToast({ message: 'Chapter created!', type: 'success' });
    } catch { setToast({ message: 'Failed to create chapter', type: 'error' }); }
  };

  const handleExpandText = async () => {
    if (inputType === 'text' && !inputText.trim()) return;
    if (inputType === 'file' && !selectedFile) return;
    setIsExpanding(true);
    setExpandedText('');
    setAudioUrl('');
    setVideoUrl('');
    try {
      const formData = new FormData();
      if (inputType === 'text') formData.append('text', inputText);
      else formData.append('file', selectedFile);
      formData.append('promptType', promptType);
      formData.append('language', textLanguage);
      formData.append('aiProvider', aiProvider);
      formData.append('aiModel', aiModel);
      const response = await api.post('/api/expand-text', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setExpandedText(response.data.expandedText);
      try {
        const historyResponse = await api.post('/api/history', {
          title: (inputType === 'text' ? inputText.substring(0, 50) : selectedFile?.name) || 'Generated Content',
          text: response.data.expandedText,
          audioUrl: '', videoUrl: '',
        });
        setCurrentHistoryId(String(historyResponse.data.id));
      } catch { /* non-critical */ }
      setToast({ message: 'Content expanded successfully!', type: 'success' });
    } catch (err) {
      setToast({ message: err.response?.data?.error || 'Failed to expand text', type: 'error' });
    } finally { setIsExpanding(false); }
  };

  const getQuery = () => (inputType === 'text' ? inputText.trim() : selectedFile?.name || '');

  const resolveScope = async (query) => {
    if (learningScope !== 'auto') return learningScope;
    try {
      const res = await api.post('/api/courses/classify-scope', { query, aiProvider, aiModel });
      setDetectedScope(res.data.learning_scope);
      return res.data.learning_scope || 'quick-lesson';
    } catch {
      return 'quick-lesson';
    }
  };

  const createCoursePlan = async (query, scope) => {
    setIsPlanning(true);
    try {
      const res = await api.post('/api/courses/plan', {
        query,
        learningScope: scope,
        isPublic,
        aiProvider,
        aiModel,
        promptType,
      });
      setToast({ message: 'Course plan created!', type: 'success' });
      navigate(`/course/${res.data.subject.id}`);
    } catch (err) {
      setToast({ message: err.response?.data?.error || 'Failed to create plan', type: 'error' });
    } finally { setIsPlanning(false); }
  };

  const handleStartLearning = async () => {
    const query = getQuery();
    if (!query) return;

    try {
      const searchRes = await api.get('/api/courses/search', { params: { q: query } });
      if (searchRes.data.matches?.length > 0) {
        setPublicMatch(searchRes.data.matches[0]);
        setShowPublicModal(true);
        return;
      }
    } catch { /* continue */ }

    await proceedWithScope(query);
  };

  const proceedWithScope = async (query) => {
    const scope = await resolveScope(query);

    if (scope === 'full-course' || scope === 'deep-dive') {
      await createCoursePlan(query, scope);
      return;
    }

    let text = expandedText;
    if (!text.trim()) {
      setIsExpanding(true);
      try {
        const formData = new FormData();
        if (inputType === 'text') formData.append('text', inputText);
        else if (selectedFile) formData.append('file', selectedFile);
        formData.append('promptType', promptType);
        formData.append('language', textLanguage);
        formData.append('aiProvider', aiProvider);
        formData.append('aiModel', aiModel);
        const response = await api.post('/api/expand-text', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        text = response.data.expandedText;
        setExpandedText(text);
      } catch {
        setToast({ message: 'Failed to expand text', type: 'error' });
        return;
      } finally { setIsExpanding(false); }
    }
    if (outputType === 'video') {
      setConfirmQuick(true);
    } else {
      setIsGeneratingMedia(true);
      try {
        const audioResponse = await api.post('/api/generate-audio', { text, language: audioLanguage });
        setAudioUrl(audioResponse.data.audioUrl);
        setToast({ message: 'Audio generated!', type: 'success' });
      } catch (err) {
        setToast({ message: err.response?.data?.error || 'Failed', type: 'error' });
      } finally { setIsGeneratingMedia(false); }
    }
  };

  const startQuickLessonVideo = async () => {
    setIsGeneratingMedia(true);
    try {
      const res = await api.post('/api/courses/quick-lesson', {
        query: getQuery(),
        expandedText,
        confirmed: true,
        isPublic,
        aiProvider,
        aiModel,
        language: audioLanguage,
        promptType,
      });
      trackJob(res.data.jobId, {
        label: getQuery(),
        subjectId: res.data.subjectId,
        chapterId: res.data.chapterId,
      });
      setToast({ message: 'Video generating in background — switch tabs freely!', type: 'success' });
      navigate(`/course/${res.data.subjectId}`);
    } catch (err) {
      setToast({ message: err.response?.data?.error || 'Failed to start', type: 'error' });
    } finally { setIsGeneratingMedia(false); setConfirmQuick(false); }
  };

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Hero */}
        <div className="text-center pt-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-100 text-indigo-700 text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" /> AI-Powered Learning Studio
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
            Create Interactive
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent"> Video Lessons</span>
          </h1>
          <p className="mt-4 text-lg text-slate-500 max-w-2xl mx-auto">
            Enter any topic, let AI expand it into rich content, then generate polished slides with quizzes.
          </p>
        </div>

        <DashboardStats />
        <StepProgress currentStep={currentStep} />

        {/* Step 1: Input */}
        <div className="card p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-600"><FileText className="h-5 w-5" /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">1. Your Topic</h2>
              <p className="text-sm text-slate-500">Paste text or upload a document</p>
            </div>
          </div>

          <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
            {['text', 'file'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setInputType(type)}
                className={`flex-1 py-2.5 px-4 text-sm font-medium rounded-lg transition-all ${
                  inputType === type ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {type === 'text' ? 'Text Input' : 'File Upload'}
              </button>
            ))}
          </div>

          {inputType === 'text' ? (
            <div className="space-y-3">
              <textarea
                rows={4}
                className="input-field resize-none"
                placeholder="E.g., Explain how photosynthesis works..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-slate-400 flex items-center gap-1"><Lightbulb className="h-3.5 w-3.5" /> Try:</span>
                {TOPIC_SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => setInputText(s)} className="text-xs px-3 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div
              className="flex flex-col items-center justify-center px-6 py-10 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors"
              onClick={() => document.getElementById('file-upload-input').click()}
            >
              <Upload className="h-10 w-10 text-slate-300 mb-3" />
              {selectedFile ? (
                <p className="text-sm font-medium text-indigo-600 text-center break-all px-2">{selectedFile.name}</p>
              ) : (
                <>
                  <span className="text-sm font-medium text-indigo-600">Tap to upload PDF or TXT</span>
                  <span className="text-xs text-slate-400 mt-1">Up to 10MB</span>
                </>
              )}
              <input
                id="file-upload-input"
                type="file"
                className="hidden"
                accept=".pdf,.txt"
                onChange={(e) => setSelectedFile(e.target.files[0])}
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">AI Provider</label>
              <select value={aiProvider} onChange={(e) => { setAiProvider(e.target.value); setAiModel(e.target.value === 'groq' ? 'llama-3.3-70b-versatile' : 'gemini-2.5-flash'); }} className="input-field py-2.5">
                <option value="groq">Groq (Fast)</option>
                <option value="gemini">Gemini</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">AI Model</label>
              <select value={aiModel} onChange={(e) => setAiModel(e.target.value)} className="input-field py-2.5">
                {aiProvider === 'groq' ? (
                  <>
                    <option value="llama-3.3-70b-versatile">Llama 3.3 70B</option>
                    <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant</option>
                  </>
                ) : (
                  <>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">Learning Scope</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {LEARNING_SCOPES.map((s) => (
                <label key={s.value} className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer ${learningScope === s.value ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-100'}`}>
                  <input type="radio" name="scope" value={s.value} checked={learningScope === s.value} onChange={() => setLearningScope(s.value)} className="mt-1 accent-indigo-600" />
                  <div>
                    <p className="text-sm font-medium text-slate-800">{s.label}</p>
                    <p className="text-xs text-slate-400">{s.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            {detectedScope && learningScope === 'auto' && (
              <p className="text-xs text-indigo-600">Detected: {detectedScope.replace('-', ' ')}</p>
            )}
          </div>

          <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 cursor-pointer">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="accent-indigo-600" />
            <div className="flex items-center gap-2 text-sm text-slate-700">
              {isPublic ? <Globe className="h-4 w-4 text-indigo-500" /> : <Lock className="h-4 w-4 text-slate-400" />}
              Share this course publicly (others can use or fork it)
            </div>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Content Style</label>
              <div className="space-y-2">
                {PROMPT_TYPES.map((p) => (
                  <label key={p.value} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${promptType === p.value ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-100 hover:border-slate-200'}`}>
                    <input type="radio" name="promptType" value={p.value} checked={promptType === p.value} onChange={(e) => setPromptType(e.target.value)} className="mt-1 accent-indigo-600" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{p.label}</p>
                      <p className="text-xs text-slate-400">{p.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-indigo-500" /> Output Language
              </label>
              <select value={textLanguage} onChange={(e) => setTextLanguage(e.target.value)} className="input-field py-2.5">
                {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
              <p className="text-xs text-slate-400 mt-2">Native script enforced for Telugu & Hindi — no transliteration.</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={handleExpandText} disabled={isExpanding || !getQuery()} className="btn-secondary flex-1">
              {isExpanding ? <><Loader2 className="animate-spin h-5 w-5" /> Expanding...</> : <><BookOpen className="h-5 w-5" /> Expand Text Only</>}
            </button>
            <button type="button" onClick={handleStartLearning} disabled={isExpanding || isPlanning || !getQuery()} className="btn-primary flex-1">
              {isPlanning ? <><Loader2 className="animate-spin h-5 w-5" /> Planning...</> : <><Wand2 className="h-5 w-5" /> Start Learning</>}
            </button>
          </div>
        </div>

        {/* Step 2: Expanded + Generate */}
        {expandedText && (
          <div className="card p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-violet-100 text-violet-600"><Wand2 className="h-5 w-5" /></div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">2. Generate Media</h2>
                <p className="text-sm text-slate-500">Review expanded content, then create audio or video</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-5 text-slate-700 text-sm leading-relaxed max-h-56 overflow-y-auto border border-slate-100">
              {expandedText}
            </div>
            <button type="button" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([expandedText])); a.download = 'lesson.txt'; a.click(); }} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
              <Download className="h-4 w-4" /> Download text
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Output Format</label>
                <div className="flex gap-2">
                  {[{ v: 'audio', l: 'Audio Only' }, { v: 'video', l: 'Video + Quizzes' }].map(({ v, l }) => (
                    <button key={v} type="button" onClick={() => setOutputType(v)} className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium border transition-all ${outputType === v ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                  <Mic className="h-4 w-4 text-indigo-500" /> Voice (Edge TTS)
                </label>
                <select value={audioLanguage} onChange={(e) => setAudioLanguage(e.target.value)} className="input-field py-2.5">
                  {voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </div>
            </div>

            {outputType === 'video' && (
              <button type="button" onClick={() => setConfirmQuick(true)} disabled={isGeneratingMedia} className="btn-primary w-full">
                {isGeneratingMedia ? <><Loader2 className="animate-spin h-5 w-5" /> Starting...</> : 'Generate Quick Lesson Video'}
              </button>
            )}
            {outputType === 'audio' && (
              <button type="button" onClick={async () => {
                setIsGeneratingMedia(true);
                try {
                  const r = await api.post('/api/generate-audio', { text: expandedText, language: audioLanguage });
                  setAudioUrl(r.data.audioUrl);
                  setToast({ message: 'Audio ready!', type: 'success' });
                } catch { setToast({ message: 'Failed', type: 'error' }); }
                finally { setIsGeneratingMedia(false); }
              }} className="btn-primary w-full">Generate Audio</button>
            )}
          </div>
        )}

        {/* Step 3: Preview */}
        {(audioUrl || videoUrl) && (
          <div className="card p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-600"><Sparkles className="h-5 w-5" /></div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">3. Preview & Learn</h2>
                <p className="text-sm text-slate-500">Your lesson is ready</p>
              </div>
            </div>

            {audioUrl && (
              <div className="space-y-4">
                <h3 className="font-medium text-slate-800">Audio Player</h3>
                <div ref={waveformRef} className="w-full bg-slate-50 rounded-xl p-3 border border-slate-100 cursor-pointer" />
                <div className="flex flex-wrap items-center gap-4">
                  <button type="button" onClick={() => wavesurfer.current?.playPause()} className="p-3 rounded-full bg-indigo-100 text-indigo-600 hover:bg-indigo-200">
                    {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                  </button>
                  <div>
                    <label className="text-xs text-slate-500">Speed: {playbackSpeed}x</label>
                    <input type="range" min="0.5" max="2" step="0.25" value={playbackSpeed} onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))} className="w-28 accent-indigo-600 block" />
                  </div>
                  <a href={`${API_BASE_URL}${audioUrl}`} download className="btn-secondary text-sm ml-auto"><Download className="h-4 w-4" /> Download</a>
                </div>
              </div>
            )}

            {videoUrl && (
              <InteractiveVideoPlayer videoUrl={videoUrl} interactiveQuizzes={interactiveQuizzes} apiBaseUrl={API_BASE_URL} />
            )}
          </div>
        )}
      </div>

      <PublicCourseModal
        open={showPublicModal}
        course={publicMatch}
        onUse={async () => {
          setShowPublicModal(false);
          try {
            const res = await api.post(`/api/courses/${publicMatch.id}/use`);
            navigate(`/course/${res.data.id}`);
          } catch { setToast({ message: 'Failed to copy', type: 'error' }); }
        }}
        onFork={async () => {
          setShowPublicModal(false);
          try {
            const res = await api.post(`/api/courses/${publicMatch.id}/fork`);
            navigate(`/course/${res.data.id}`);
          } catch { setToast({ message: 'Failed to fork', type: 'error' }); }
        }}
        onPreview={() => { setShowPublicModal(false); navigate(`/explore/${publicMatch.id}`); }}
        onGenerateOwn={async () => {
          setShowPublicModal(false);
          await proceedWithScope(getQuery());
        }}
        onClose={() => setShowPublicModal(false)}
      />

      <ConfirmModal
        open={confirmQuick}
        title="Generate video lesson?"
        message={`Start AI video generation for "${getQuery()}"? This runs in the background — you can navigate to other tabs while it completes.`}
        confirmLabel="Yes, generate"
        onConfirm={startQuickLessonVideo}
        onCancel={() => setConfirmQuick(false)}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
