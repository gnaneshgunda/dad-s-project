import { useEffect } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

export default function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4500);
    return () => clearTimeout(timer);
  }, [onClose]);

  const styles = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    error: 'bg-rose-50 border-rose-200 text-rose-800',
    info: 'bg-indigo-50 border-indigo-200 text-indigo-800',
  };

  const Icon = type === 'success' ? CheckCircle2 : type === 'error' ? XCircle : CheckCircle2;

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-2xl border shadow-xl backdrop-blur-sm animate-in slide-in-from-bottom-4 ${styles[type]}`}>
      <Icon className="h-5 w-5 shrink-0" />
      <p className="text-sm font-medium pr-2">{message}</p>
      <button type="button" onClick={onClose} className="opacity-60 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
