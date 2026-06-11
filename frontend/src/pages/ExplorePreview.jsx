import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, ChevronLeft, Copy, Sparkles } from 'lucide-react';
import api from '../lib/api';
import Toast from '../components/Toast';

export default function ExplorePreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api.get(`/api/courses/public/${id}/preview`)
      .then((res) => setCourse(res.data))
      .catch(() => setToast({ message: 'Course not found', type: 'error' }))
      .finally(() => setLoading(false));
  }, [id]);

  const handleUse = async () => {
    try {
      const res = await api.post(`/api/courses/${id}/use`);
      setToast({ message: 'Course added to your library!', type: 'success' });
      setTimeout(() => navigate(`/course/${res.data.id}`), 800);
    } catch {
      setToast({ message: 'Failed to copy course', type: 'error' });
    }
  };

  const handleFork = async () => {
    try {
      const res = await api.post(`/api/courses/${id}/fork`);
      setToast({ message: 'Course forked — generate your own videos!', type: 'success' });
      setTimeout(() => navigate(`/course/${res.data.id}`), 800);
    } catch {
      setToast({ message: 'Failed to fork course', type: 'error' });
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-indigo-600" /></div>;
  }

  if (!course) return <div className="text-center py-20 text-slate-500">Not found</div>;

  return (
    <div className="py-8 px-4 max-w-3xl mx-auto space-y-6">
      <Link to="/explore" className="inline-flex items-center gap-1 text-sm text-indigo-600">
        <ChevronLeft className="h-4 w-4" /> Explore
      </Link>

      <div className="card p-6">
        <p className="text-sm text-slate-500">by {course.ownerLabel}</p>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">{course.name}</h1>
        {course.description && <p className="text-slate-600 mt-2">{course.description}</p>}

        <div className="flex flex-wrap gap-2 mt-6">
          <button type="button" onClick={handleUse} className="btn-primary text-sm">
            <Copy className="h-4 w-4" /> Use this course
          </button>
          <button type="button" onClick={handleFork} className="btn-secondary text-sm">
            <Sparkles className="h-4 w-4" /> Fork &amp; generate my own
          </button>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-bold text-slate-900 mb-4">Curriculum ({course.chapters?.length} lessons)</h2>
        <ol className="space-y-2">
          {course.chapters?.map((ch, i) => (
            <li key={ch.id} className="flex gap-3 text-sm">
              <span className="font-bold text-slate-400 w-6">{i + 1}.</span>
              <span className="text-slate-800">{ch.name}</span>
            </li>
          ))}
        </ol>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
