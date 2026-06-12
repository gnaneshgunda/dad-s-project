import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  Loader2, ChevronLeft, Play, RefreshCw, Lock, Globe, Video,
  PanelLeft, PanelLeftClose, Maximize2, Minimize2, Eye,
} from 'lucide-react';
import api from '../lib/api';
import { API_BASE_URL } from '../lib/config';
import ConfirmModal from '../components/ConfirmModal';
import InteractiveVideoPlayer from '../components/InteractiveVideoPlayer';
import DualProgressBar from '../components/DualProgressBar';
import { useGeneration } from '../context/GenerationContext';
import Toast from '../components/Toast';

export default function Course() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const highlightChapterId = searchParams.get('chapter');
  const { trackJob, jobs } = useGeneration();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [activeChapterId, setActiveChapterId] = useState(null);
  const [activeVideo, setActiveVideo] = useState(null);
  const [activeQuizzes, setActiveQuizzes] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theaterMode, setTheaterMode] = useState(false);
  const lessonRefs = useRef({});
  const handledJobsRef = useRef(new Set());
  const loadErrorShownRef = useRef(false);
  const [videoLoading, setVideoLoading] = useState(false);

  const loadCourse = useCallback(async () => {
    try {
      const res = await api.get(`/api/courses/${id}`);
      setCourse(res.data);
      return res.data;
    } catch {
      if (!loadErrorShownRef.current) {
        loadErrorShownRef.current = true;
        setToast({ message: 'Failed to load course', type: 'error' });
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadCourse(); }, [loadCourse]);

  useEffect(() => {
    jobs
      .filter((j) => j.subjectId === Number(id) && (j.status === 'completed' || j.status === 'failed'))
      .forEach((j) => {
        if (!handledJobsRef.current.has(j.id)) {
          handledJobsRef.current.add(j.id);
          loadCourse();
        }
      });
  }, [jobs, id, loadCourse]);

  const selectChapter = useCallback(async (chapter, selectedVideo = null) => {
    if (!chapter.videos?.length) return;
    setVideoLoading(true);
    setActiveChapterId(chapter.id);
    // If a specific video is provided use it, otherwise fallback to first video
    const video = selectedVideo || chapter.videos[0];
    // Eagerly set the video from the sidebar object so the player swaps
    // the source immediately; we'll overwrite with the full API object below.
    setActiveVideo(video);
    setActiveQuizzes([]);
    try {
      // Fetch the full video record — this guarantees a fresh videoUrl and
      // also gives us the interactive quizzes in one round-trip.
      const res = await api.get(`/api/videos/${video.id}`);
      // Overwrite with the API's full video object (has videoUrl, etc.)
      setActiveVideo(res.data);
      setActiveQuizzes(res.data.interactiveQuizzes || []);
    } catch {
      setActiveQuizzes([]);
    } finally {
      setVideoLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!course?.chapters?.length) return;
    const targetId = highlightChapterId ? Number(highlightChapterId) : null;
    const target = targetId
      ? course.chapters.find((c) => c.id === targetId && c.videos?.length)
      : course.chapters.find((c) => c.videos?.length);
    // Only auto-select a chapter when nothing is active yet.
    // Without the `!activeVideo` guard, every loadCourse() refresh would
    // re-trigger this effect and silently reset the player back to the
    // first chapter, overwriting whatever the user clicked.
    if (target && !activeVideo && activeChapterId !== target.id) {
      selectChapter(target);
    }
    if (targetId && lessonRefs.current[targetId]) {
      lessonRefs.current[targetId].scrollIntoView({ block: 'nearest' });
    }
  }, [course, highlightChapterId, selectChapter, activeChapterId, activeVideo]);

  const jobForChapter = (chapterId) =>
    jobs.find((j) => j.chapterId === chapterId && (j.status === 'pending' || j.status === 'running'));

  const isGenerating = (chapterId) =>
    jobs.some((j) => j.chapterId === chapterId && (j.status === 'pending' || j.status === 'running'))
    || course?.chapters.find((c) => c.id === chapterId)?.generationStatus === 'generating';

  const startGenerate = async (chapter, regenerate) => {
    try {
      const res = await api.post(`/api/chapters/${chapter.id}/generate`, {
        confirmed: true,
        regenerate,
        aiProvider: 'groq',
        aiModel: 'llama-3.3-70b-versatile',
        language: 'en-US-AriaNeural',
        promptType: 'explain-detailed',
        expandedText: chapter.topicQuery || chapter.name,
      });
      trackJob(res.data.jobId, {
        label: chapter.name,
        chapterId: chapter.id,
        subjectId: Number(id),
      });
      setToast({ message: `Generating "${chapter.name}" in background…`, type: 'success' });
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
        ? `Replace the existing video for "${chapter.name}"?`
        : `Start AI video for "${chapter.name}"? Runs in background.`,
      regenerate: hasVideo,
    });
  };

  const markLessonComplete = async () => {
    if (!activeChapterId) return;
    try {
      await api.post(`/api/progress/chapters/${activeChapterId}/complete`);
      setCourse((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          chapters: prev.chapters.map((c) => (c.id === activeChapterId ? { ...c, watched: true } : c)),
          progress: {
            ...prev.progress,
            watched: prev.chapters.filter((c) => c.id === activeChapterId || c.watched).length,
            watchedPercent: prev.chapters.length
              ? Math.round((prev.chapters.filter((c) => c.id === activeChapterId || c.watched).length / prev.chapters.length) * 100)
              : 0,
          },
        };
      });
      loadCourse();
    } catch { /* non-critical */ }
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

  if (loading) {
    return (
      <div className="h-[calc(100dvh-4rem)] flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-indigo-600" />
      </div>
    );
  }

  if (!course) {
    return <div className="text-center py-20 text-slate-500">Course not found</div>;
  }

  const activeChapter = course.chapters.find((c) => c.id === activeChapterId);

  return (
    <div className="flex flex-col bg-slate-50 h-[calc(100dvh-4rem)] sm:h-[calc(100dvh-4rem)] pb-16 sm:pb-0">
      {/* Header */}
      {!theaterMode && (
        <div className="shrink-0 border-b border-slate-200 bg-white px-3 sm:px-5 py-3">
          <div className="flex items-center gap-3">
            <Link to="/courses" className="text-slate-500 hover:text-indigo-600 shrink-0">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-slate-900 truncate text-sm sm:text-base">{course.name}</h1>
              <p className="text-xs text-slate-400 hidden sm:block">{course.learningScope?.replace('-', ' ')}</p>
            </div>
            <button type="button" onClick={() => setSidebarOpen((v) => !v)} className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
              {sidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
            </button>
            <button type="button" onClick={togglePublic} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
              {course.isPublic ? <><Globe className="h-3.5 w-3.5" /> Public</> : <><Lock className="h-3.5 w-3.5" /> Private</>}
            </button>
          </div>
          <div className="mt-3 max-w-xl">
            <DualProgressBar progress={course.progress} compact />
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        {/* Playlist sidebar */}
        {/* Playlist sidebar */}
        {sidebarOpen && !theaterMode && (
          <aside className="w-full lg:w-[30%] lg:max-w-sm border-b lg:border-b-0 lg:border-r border-slate-200 bg-white flex flex-col min-h-0 max-h-[38vh] lg:max-h-none shrink-0">
            <div className="p-3 border-b border-slate-100 flex items-center justify-between shrink-0">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Playlist</span>
              <span className="text-xs text-slate-400">{course.chapters.length} lessons</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {course.chapters.map((chapter, idx) => {
                const hasVideo = chapter.videos?.length > 0;
                const generating = isGenerating(chapter.id);
                const job = jobForChapter(chapter.id);
                const percent = job?.progressData?.percent;
                const isActive = activeChapterId === chapter.id;
                return (
                  <div
                    key={chapter.id}
                    ref={(el) => { lessonRefs.current[chapter.id] = el; }}
                    className={`rounded-xl p-3 transition-colors ${isActive ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-slate-50 border border-transparent'
                      }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 line-clamp-2">{chapter.name}</p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {hasVideo && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">Generated</span>
                          )}
                          {chapter.watched && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 flex items-center gap-0.5">
                              <Eye className="h-2.5 w-2.5" /> Watched
                            </span>
                          )}
                          {generating && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                              {percent != null ? `${percent}%` : 'Generating…'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1.5 mt-2 ml-8">
                      {hasVideo ? (
                        <div className="flex flex-col gap-1">
                          {/* List each video in the chapter */}
                          {chapter.videos.map((video) => (
                            <button
                              key={video.id}
                              type="button"
                              onClick={() => { selectChapter(chapter, video); if (window.innerWidth < 640) setSidebarOpen(false); }}
                              className="flex-1 text-xs py-1.5 px-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 flex items-center justify-center gap-1"
                            >
                              <Play className="h-3 w-3" /> Play
                            </button>
                          ))}
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={generating}
                          onClick={() => handleGenerateClick(chapter)}
                          className="flex-1 text-xs py-1.5 px-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Video className="h-3 w-3" />}
                          Generate
                        </button>
                      )}
                      {hasVideo && (
                        <button
                          type="button"
                          disabled={generating}
                          onClick={() => handleGenerateClick(chapter)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                          title="Regenerate"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        {/* Video area */}
        <main className={`flex-1 flex flex-col min-h-0 min-w-0 ${theaterMode ? 'fixed inset-0 z-50 bg-black p-3 sm:p-4' : 'p-3 sm:p-4 lg:w-[70%]'}`}>
          {theaterMode && (
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h2 className="font-semibold text-white text-sm truncate">{activeChapter?.name}</h2>
              <button
                type="button"
                onClick={() => { setTheaterMode(false); setSidebarOpen(true); }}
                className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            </div>
          )}

          {!theaterMode && activeVideo && (
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h2 className="font-semibold text-slate-900 text-sm sm:text-base truncate">{activeChapter?.name}</h2>
              <button
                type="button"
                onClick={() => { setTheaterMode(true); setSidebarOpen(false); }}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-200/80"
                title="Theater mode"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          )}

          {activeVideo?.videoUrl ? (
            <div className="relative flex-1 flex flex-col min-h-0">
              {videoLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/70 rounded-xl gap-2">
                  <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
                  <p className="text-sm text-white">Preparing lesson…</p>
                </div>
              )}
              <InteractiveVideoPlayer
                key={activeVideo.id}
                videoUrl={activeVideo.videoUrl}
                interactiveQuizzes={activeQuizzes}
                apiBaseUrl={API_BASE_URL}
                embedded
                showHeader={false}
                onLessonComplete={markLessonComplete}
                className="flex-1 min-h-0"
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-white rounded-2xl border border-slate-100">
              <Video className="h-12 w-12 text-slate-300 mb-4" />
              <p className="text-slate-600 font-medium">No lesson selected</p>
              <p className="text-sm text-slate-400 mt-1 max-w-sm">
                Pick a lesson from the playlist or generate one to start watching.
              </p>
              {course.chapters.some((c) => !c.videos?.length) && (
                <button
                  type="button"
                  onClick={() => {
                    const pending = course.chapters.find((c) => !c.videos?.length);
                    if (pending) handleGenerateClick(pending);
                  }}
                  className="mt-4 btn-primary text-sm"
                >
                  Generate first lesson
                </button>
              )}
            </div>
          )}
        </main>
      </div>

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
