import { Users, Copy, Eye, Sparkles } from 'lucide-react';

export default function PublicCourseModal({
  open,
  course,
  onUse,
  onFork,
  onPreview,
  onGenerateOwn,
  onClose,
}) {
  if (!open || !course) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-600">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Course already exists</h3>
            <p className="text-sm text-slate-500 mt-1">
              A public course on &ldquo;{course.name}&rdquo; exists by <strong>{course.ownerLabel}</strong>
              {' '}({course.completedLessons}/{course.lessonCount} lessons ready)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button type="button" onClick={onUse} className="flex items-center gap-2 p-3 rounded-xl border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-left text-sm font-medium text-indigo-900">
            <Copy className="h-4 w-4 shrink-0" /> Use their course
          </button>
          <button type="button" onClick={onPreview} className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-left text-sm font-medium">
            <Eye className="h-4 w-4 shrink-0" /> Preview first
          </button>
          <button type="button" onClick={onFork} className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-left text-sm font-medium">
            <Copy className="h-4 w-4 shrink-0" /> Fork &amp; customize
          </button>
          <button type="button" onClick={onGenerateOwn} className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-left text-sm font-medium">
            <Sparkles className="h-4 w-4 shrink-0" /> Generate my own
          </button>
        </div>

        <button type="button" onClick={onClose} className="mt-4 w-full text-sm text-slate-500 hover:text-slate-700 py-2">
          Cancel
        </button>
      </div>
    </div>
  );
}
