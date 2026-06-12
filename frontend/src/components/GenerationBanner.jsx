import { Link } from 'react-router-dom';
import { Loader2, CheckCircle2, X, AlertCircle } from 'lucide-react';
import { useGeneration } from '../context/GenerationContext';

const STEP_LABELS = {
  queued: 'Queued',
  blueprint: 'Planning content',
  slides: 'Writing slides',
  rendering: 'Rendering slides',
  audio: 'Generating audio',
  video: 'Building video',
  saving: 'Saving',
  generating: 'Generating',
  done: 'Done',
  failed: 'Failed',
};

export default function GenerationBanner() {
  const { jobs, removeJob } = useGeneration();
  const active = jobs.filter((j) => j.status === 'pending' || j.status === 'running');
  const finished = jobs.filter((j) => j.status === 'completed').slice(0, 2);
  const failed = jobs.filter((j) => j.status === 'failed').slice(0, 2);

  if (active.length === 0 && finished.length === 0 && failed.length === 0) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 space-y-2">
      {active.map((job) => {
        const percent = job.progressData?.percent ?? 0;
        const step = STEP_LABELS[job.progressData?.step] || job.progressData?.step || 'Working';
        return (
          <div key={job.id} className="bg-slate-900 text-white rounded-xl shadow-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{job.label || 'Generating video…'}</p>
                <p className="text-xs text-slate-400">{step} — continues in background</p>
              </div>
              {job.subjectId && (
                <Link
                  to={`/course/${job.subjectId}`}
                  className="text-xs text-indigo-300 hover:text-indigo-200 shrink-0"
                >
                  View
                </Link>
              )}
            </div>
            <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.max(percent, 5)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1 text-right">{percent}%</p>
          </div>
        );
      })}

      {finished.map((job) => (
        <div key={`done-${job.id}`} className="bg-emerald-600 text-white rounded-xl shadow-xl px-4 py-3 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{job.label || 'Video'} complete!</p>
            {job.subjectId && (
              <Link to={`/course/${job.subjectId}`} className="text-xs text-emerald-100 hover:underline">
                Open course →
              </Link>
            )}
          </div>
          <button type="button" onClick={() => removeJob(job.id)} className="opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      {failed.map((job) => (
        <div key={`fail-${job.id}`} className="bg-red-600 text-white rounded-xl shadow-xl px-4 py-3 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">Failed: {job.label || 'Video'}</p>
            <p className="text-xs text-red-100 truncate">{job.error || 'Generation error'}</p>
          </div>
          <button type="button" onClick={() => removeJob(job.id)} className="opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
