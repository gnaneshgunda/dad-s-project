import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2, BookOpen, ChevronRight, Video, RefreshCw, Globe, Lock, Play,
} from 'lucide-react';
import api from '../lib/api';
import ConfirmModal from '../components/ConfirmModal';
import { useGeneration } from '../context/GenerationContext';
import Toast from '../components/Toast';
import DualProgressBar from '../components/DualProgressBar';

export default function MyCourses() {
  const { jobs, trackJob } = useGeneration();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const loadCourses = useCallback(async () => {
    try {
      const res = await api.get('/api/courses/mine');
      setCourses(res.data);
    } catch {
      setToast({ message: 'Failed to load courses', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCourses(); }, [loadCourses]);

  useEffect(() => {
    if (jobs.some((j) => j.status === 'completed' || j.status === 'failed')) {
      loadCourses();
    }
  }, [jobs, loadCourses]);

  const isGenerating = (chapterId) =>
    jobs.some((j) => j.chapterId === chapterId && (j.status === 'pending' || j.status === 'running'));

  const jobForChapter = (chapterId) =>
    jobs.find((j) => j.chapterId === chapterId && j.status !== 'failed');

  const startGenerate = async (courseId, chapter, regenerate) => {
    try {
      const res = await api.post(`/api/chapters/${chapter.id}/generate`, {
        confirmed: true,
        regenerate,
        aiProvider: 'groq',
        aiModel: 'llama-3.3-70b-versatile',
        language: 'en-US-AriaNeural',
        promptType: 'explain-detailed',
        expandedText: chapter.name,
      });
      trackJob(res.data.jobId, {
        label: chapter.name,
        chapterId: chapter.id,
        subjectId: courseId,
      });
      setToast({ message: `Generating "${chapter.name}" in background…`, type: 'success' });
      loadCourses();
    } catch (err) {
      setToast({ message: err.response?.data?.error || 'Failed to start generation', type: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Courses</h1>
        <p className="text-slate-500 text-sm mt-1">
          Generate lesson videos here — jobs keep running even if you switch tabs.
        </p>
      </div>

      {courses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-500">
          <BookOpen className="h-12 w-12 mx-auto mb-4 text-slate-300" />
          <p>No courses yet.</p>
          <Link to="/" className="text-indigo-600 hover:text-indigo-800 text-sm font-medium mt-2 inline-block">
            Create one from Studio →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {courses.map((course) => (
            <div key={course.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                        {course.learningScope?.replace('-', ' ')}
                      </span>
                      {course.isPublic
                        ? <Globe className="h-3.5 w-3.5 text-emerald-500" />
                        : <Lock className="h-3.5 w-3.5 text-slate-400" />}
                    </div>
                    <h2 className="font-bold text-slate-900 mt-1 truncate">{course.name}</h2>
                    <p className="text-xs text-slate-400 mt-1">
                      {course.progress.generated} generated · {course.progress.watched} watched
                      {course.pendingCount > 0 && ` · ${course.pendingCount} pending`}
                    </p>
                  </div>
                  <Link
                    to={`/course/${course.id}`}
                    className="shrink-0 inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Open <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>

                <div className="mt-3">
                  <DualProgressBar progress={course.progress} compact />
                </div>
              </div>

              {course.pendingChapters.length > 0 && (
                <div className="border-t border-slate-100 px-5 py-3 space-y-2 bg-slate-50/50">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pending lessons</p>
                  {course.pendingChapters.slice(0, 5).map((chapter) => {
                    const generating = isGenerating(chapter.id) || chapter.generationStatus === 'generating';
                    const job = jobForChapter(chapter.id);
                    const percent = job?.progressData?.percent;
                    return (
                      <div key={chapter.id} className="flex items-center gap-3 py-1.5">
                        <span className="flex-1 text-sm text-slate-700 truncate">{chapter.name}</span>
                        {generating && (
                          <span className="text-xs text-indigo-600 flex items-center gap-1 shrink-0">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            {percent != null ? `${percent}%` : 'Starting…'}
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={generating}
                          onClick={() => setConfirm({
                            courseId: course.id,
                            chapter,
                            title: 'Generate this lesson?',
                            message: `Start AI video for "${chapter.name}"? Runs in background — safe to leave this page.`,
                            regenerate: false,
                          })}
                          className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {generating ? 'Working…' : <><Video className="h-3 w-3" /> Generate</>}
                        </button>
                      </div>
                    );
                  })}
                  {course.pendingChapters.length > 5 && (
                    <Link to={`/course/${course.id}`} className="text-xs text-indigo-600 hover:underline">
                      +{course.pendingChapters.length - 5} more — open course
                    </Link>
                  )}
                </div>
              )}

              {course.progress.generatedPercent === 100 && (
                <div className="border-t border-emerald-100 px-5 py-3 bg-emerald-50/50 flex items-center gap-2 text-sm text-emerald-700">
                  <Play className="h-4 w-4" />
                  All lessons ready —
                  <Link to={`/course/${course.id}`} className="font-medium hover:underline">watch now</Link>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel="Yes, generate"
        onConfirm={() => {
          startGenerate(confirm.courseId, confirm.chapter, confirm.regenerate);
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
