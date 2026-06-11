import { Loader2, CheckCircle2, X } from 'lucide-react';
import { useGeneration } from '../context/GenerationContext';

export default function GenerationBanner() {
  const { jobs, removeJob } = useGeneration();
  const active = jobs.filter((j) => j.status === 'pending' || j.status === 'running');

  if (active.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-50 space-y-2">
      {active.map((job) => (
        <div key={job.id} className="bg-slate-900 text-white rounded-xl shadow-xl px-4 py-3 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{job.label || 'Generating video...'}</p>
            <p className="text-xs text-slate-400">
              {job.progressData?.step || 'working'} — continues in background
            </p>
          </div>
        </div>
      ))}
      {jobs.filter((j) => j.status === 'completed').slice(0, 1).map((job) => (
        <div key={`done-${job.id}`} className="bg-emerald-600 text-white rounded-xl shadow-xl px-4 py-3 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-sm flex-1">{job.label || 'Generation'} complete!</p>
          <button type="button" onClick={() => removeJob(job.id)} className="opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
