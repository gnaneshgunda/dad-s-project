export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const btnClass = variant === 'danger'
    ? 'bg-rose-600 hover:bg-rose-700'
    : 'bg-indigo-600 hover:bg-indigo-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in">
        <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
        <div className="text-slate-600 text-sm leading-relaxed mb-6">{message}</div>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onCancel} className="btn-secondary">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className={`px-5 py-2.5 rounded-xl text-white font-medium ${btnClass}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
