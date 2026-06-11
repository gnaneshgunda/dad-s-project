import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Globe, BookOpen, Users } from 'lucide-react';
import api from '../lib/api';

export default function Explore() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/api/courses/explore/public')
      .then((res) => setCourses(res.data))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = courses.filter((c) =>
    !search.trim() || c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
          <Globe className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Explore Courses</h1>
          <p className="text-slate-500">Discover public courses shared by the community</p>
        </div>
      </div>

      <input
        type="text"
        placeholder="Search courses..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input-field max-w-md"
      />

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin h-8 w-8 text-indigo-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-slate-500">
          <BookOpen className="h-12 w-12 mx-auto mb-4 text-slate-300" />
          No public courses yet. Be the first to share one!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((c) => (
            <div key={c.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-medium text-indigo-600 uppercase">{c.learningScope?.replace('-', ' ')}</span>
                  <h3 className="font-bold text-slate-900 mt-1">{c.name}</h3>
                  {c.description && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{c.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-4 mt-4 text-xs text-slate-400">
                <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {c.ownerLabel}</span>
                <span>{c.completedLessons}/{c.lessonCount} lessons</span>
              </div>
              <Link
                to={`/explore/${c.id}`}
                className="mt-4 inline-flex text-sm font-medium text-indigo-600 hover:text-indigo-800"
              >
                Preview course →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
