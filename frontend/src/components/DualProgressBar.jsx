export default function DualProgressBar({ progress, compact = false }) {
  if (!progress) return null;
  const { total, generated, generatedPercent, watched, watchedPercent } = progress;

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-500">Generated</span>
          <span className="font-medium text-violet-600">{generated}/{total} ({generatedPercent}%)</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${generatedPercent}%` }} />
        </div>
      </div>
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-500">Watched / completed</span>
          <span className="font-medium text-emerald-600">{watched}/{total} ({watchedPercent}%)</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${watchedPercent}%` }} />
        </div>
      </div>
    </div>
  );
}
