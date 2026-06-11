import { useEffect, useState } from 'react';
import { BookOpen, FolderTree, Video, Sparkles } from 'lucide-react';
import api from '../lib/api';

const statCards = [
  { key: 'subjects', label: 'Subjects', icon: BookOpen, color: 'from-violet-500 to-purple-600' },
  { key: 'chapters', label: 'Chapters', icon: FolderTree, color: 'from-blue-500 to-cyan-600' },
  { key: 'videos', label: 'Videos', icon: Video, color: 'from-emerald-500 to-teal-600' },
  { key: 'historyItems', label: 'Drafts', icon: Sparkles, color: 'from-amber-500 to-orange-600' },
];

export default function DashboardStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get('/api/profile')
      .then((res) => setStats(res.data.stats))
      .catch(() => setStats({ subjects: 0, chapters: 0, videos: 0, historyItems: 0 }));
  }, []);

  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {statCards.map(({ key, label, icon: Icon, color }) => (
        <div
          key={key}
          className="relative overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-sm p-5 group hover:shadow-md transition-shadow"
        >
          <div className={`absolute -right-3 -top-3 h-20 w-20 rounded-full bg-gradient-to-br ${color} opacity-10 group-hover:opacity-20 transition-opacity`} />
          <div className={`inline-flex p-2.5 rounded-xl bg-gradient-to-br ${color} text-white mb-3`}>
            <Icon className="h-5 w-5" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats[key] ?? 0}</p>
          <p className="text-sm text-slate-500 mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  );
}
