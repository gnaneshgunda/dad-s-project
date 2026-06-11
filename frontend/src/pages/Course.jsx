import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Loader2, ChevronLeft, Play, RefreshCw, Lock, Globe, CheckCircle2, Video,
} from 'lucide-react';
import api from '../lib/api';
import { API_BASE_URL } from '../lib/config';
import ConfirmModal from '../components/ConfirmModal';
import InteractiveVideoPlayer from '../components/InteractiveVideoPlayer';
import { useGeneration } from '../context/GenerationContext';
import Toast from '../components/Toast';

export default function Course() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { trackJob, jobs } = useGeneration();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [activeVideo, setActiveVideo] = useState(null);
  const [activeQuizzes, setActiveQuizzes] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [genSettings, setGenSettings] = useState({
    aiProvider: 'groq',
    aiModel: 'llama-3.3-70b-versatile',
    language: 'en-US-AriaNeural',
    promptType: 'explain-detailed',
  });

  const loadCourse = useCallback(async () => {
    try {
      const res = await api.get(`/api/courses/${id}`);
      setCourse(res.data);
    } catch {
      setToast({ message: 'Failed to load course', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadCourse(); }, [loadCourse]);

  useEffect(() => {
    const completed = jobs.find((j) => j.status === 'completed' && j.subjectId === Number(id));
    if (completed) {
      loadCourse();
    }
  }, [jobs, id, loadCourse]);

  const startGenerate = async (chapter, regenerate) => {
    try {
      const res = await api.post(`/api/chapters/${chapter.id}/generate`, {
        confirmed: true,
        regenerate,
        ...genSettings,
        expandedText: chapter.topicQuery || chapter.name,
      });
      trackJob(res.data.jobId, {
        label: `${chapter.name}`,
        chapterId: chapter.id,
        subjectId: Number(id),
      });
      setToast({ message: `Generating "${chapter.name}" in background...`, type: 'success' });
      loadCourse();
    } catch (err) {
      setToast({ message: err.response?.data?.error || 'Failed to start', type: 'error' });
    }
  };

  const handleGenerateClick = (chapter) => {
    const hasVideo = chapter.videos?.length > 0;
    setConfirm({
      chapter,
      title: hasVideo ? 'Regenerate this lesson?' : 'Generate this lesson?',
      message: hasVideo
        ? `This will replace the existing video for "${chapter.name}". This cannot be undone.`
        : `Start AI video generation for "${chapter.name}"? This runs in the background — you can switch tabs freely.`,
      regenerate: hasVideo,
    });
  };

  const togglePublic = async () => {
    try {
      await api.patch(`/api/courses/${id}`, { isPublic: !course.isPublic });
      loadCourse();
      setToast({ message: course.isPublic ? 'Course is now private' : 'Course is now public', type: 'success' });
    } catch {
      setToast({ message: 'Failed to update visibility', type: 'error' });
    }
  };

  const playVideo = async (chapter) => {
    const video = chapter.videos[0];
    setActiveVideo(video);
    try {
      const res = await api.get(`/api/videos/${video.id}`);
      setActiveQuizzes(res.data.interactiveQuizzes || []);
    } catch {
      setActiveQuizzes([]);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-indigo-600" />
      </div>
    );
  }

  if (!course) {
    return <div className="text-center py-20 text-slate-500">Course not found</div>;
  }

  const isGenerating = (chapterId) =>
    jobs.some((j) => j.chapterId === chapterId && (j.status === 'pending' || j.status === 'running'))
    || course.chapters.find((c) => c.id === chapterId)?.generationStatus === 'generating';

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-6">
      <Link to="/library" className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800">
        <ChevronLeft className="h-4 w-4" /> Back to Library
      </Link>

      <div className="card p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
              {course.learningScope?.replace('-', ' ')}
            </span>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">{course.name}</h1>
            {course.description && <p className="text-slate-500 mt-2 text-sm">{course.description}</p>}
          </div>
          <button type="button" onClick={togglePublic} className="btn-secondary text-sm shrink-0">
            {course.isPublic ? <><Globe className="h-4 w-4" /> Public</> : <><Lock className="h-4 w-4" /> Private</>}
          </button>
        </div>

        <div className="mt-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-600">Progress</span>
            <span className="font-medium text-indigo-600">{course.progress?.percent || 0}%</span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all"
              style={{ width: `${course.progress?.percent || 0}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {course.progress?.completed || 0} of {course.progress?.total || 0} lessons generated
          </p>
        </div>
      </div>

      <div className="card p-6 space-y-3">
        <h2 className="font-bold text-slate-900 mb-4">Lessons</h2>
        {course.chapters.map((chapter, idx) => {
          const hasVideo = chapter.videos?.length > 0;
          const generating = isGenerating(chapter.id);
          return (
            <div
              key={chapter.id}
              className={`flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border transition-colors ${
                hasVideo ? 'border-emerald-100 bg-emerald-50/30' : 'border-slate-100 bg-slate-50/50'
              }`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-sm font-bold text-slate-500 shrink-0">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{chapter.name}</p>
                  {chapter.description && (
                    <p className="text-xs text-slate-400 truncate">{chapter.description}</p>
                  )}
                </div>
                {hasVideo && <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 hidden sm:block" />}
              </div>

              <div className="flex gap-2 shrink-0">
                {hasVideo && (
                  <button type="button" onClick={() => playVideo(chapter)} className="btn-secondary text-sm py-2">
                    <Play className="h-4 w-4" /> Watch
                  </button>
                )}
                <button
                  type="button"
                  disabled={generating}
                  onClick={() => handleGenerateClick(chapter)}
                  className="btn-primary text-sm py-2 disabled:opacity-50"
                >
                  {generating ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
                  ) : hasVideo ? (
                    <><RefreshCw className="h-4 w-4" /> Regenerate</>
                  ) : (
                    <><Video className="h-4 w-4" /> Generate</>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {activeVideo?.videoUrl && (
        <div className="card p-6">
          <h2 className="font-bold text-slate-900 mb-4">{activeVideo.title}</h2>
          <InteractiveVideoPlayer
            videoUrl={activeVideo.videoUrl}
            interactiveQuizzes={activeQuizzes}
            apiBaseUrl={API_BASE_URL}
          />
        </div>
      )}

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.regenerate ? 'Yes, regenerate' : 'Yes, generate'}
        variant={confirm?.regenerate ? 'danger' : 'primary'}
        onConfirm={() => {
          startGenerate(confirm.chapter, confirm.regenerate);
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
