import { useState, useEffect } from 'react';
import { Loader2, FolderOpen, ChevronRight, ChevronDown, Video, Plus, Trash2, Library as LibraryIcon } from 'lucide-react';
import api from '../lib/api';
import { API_BASE_URL } from '../lib/config';
import InteractiveVideoPlayer from '../components/InteractiveVideoPlayer';
import Toast from '../components/Toast';

export default function Library() {
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedSubjects, setExpandedSubjects] = useState({});
  const [expandedChapters, setExpandedChapters] = useState({});
  const [activeVideo, setActiveVideo] = useState(null);
  const [activeQuizzes, setActiveQuizzes] = useState([]);
  const [toast, setToast] = useState(null);

  const [newSubjectName, setNewSubjectName] = useState('');
  const [newChapterNames, setNewChapterNames] = useState({});

  const fetchLibrary = async () => {
    try {
      const response = await api.get('/api/library');
      setLibrary(response.data);
    } catch (err) {
      console.error('Error fetching library:', err);
      setError('Failed to load your library.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, []);

  const toggleSubject = (id) => {
    setExpandedSubjects((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleChapter = (id) => {
    setExpandedChapters((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCreateSubject = async (e) => {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    try {
      await api.post('/api/subjects', { name: newSubjectName.trim() });
      setNewSubjectName('');
      fetchLibrary();
      setToast({ message: 'Subject created!', type: 'success' });
    } catch {
      setToast({ message: 'Failed to create subject', type: 'error' });
    }
  };

  const handleCreateChapter = async (subjectId) => {
    const name = newChapterNames[subjectId]?.trim();
    if (!name) return;
    try {
      await api.post(`/api/subjects/${subjectId}/chapters`, { name });
      setNewChapterNames((prev) => ({ ...prev, [subjectId]: '' }));
      fetchLibrary();
      setExpandedSubjects((prev) => ({ ...prev, [subjectId]: true }));
      setToast({ message: 'Chapter created!', type: 'success' });
    } catch {
      setToast({ message: 'Failed to create chapter', type: 'error' });
    }
  };

  const handleDeleteSubject = async (subjectId) => {
    if (!confirm('Delete this subject and all its chapters/videos?')) return;
    try {
      await api.delete(`/api/subjects/${subjectId}`);
      fetchLibrary();
      setToast({ message: 'Subject deleted', type: 'success' });
    } catch {
      setToast({ message: 'Failed to delete subject', type: 'error' });
    }
  };

  const handlePlayVideo = async (video) => {
    setActiveVideo(video);
    try {
      const response = await api.get(`/api/videos/${video.id}`);
      setActiveQuizzes(response.data.interactiveQuizzes || []);
    } catch {
      setActiveQuizzes([]);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-200">
            <LibraryIcon className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">My Library</h1>
            <p className="text-slate-500">Organize lessons by subject and chapter.</p>
          </div>
        </div>

        {error && <div className="text-red-500 text-center">{error}</div>}

        <form onSubmit={handleCreateSubject} className="card p-5 flex gap-3">
          <input
            type="text"
            placeholder="New subject (e.g. Physics, Mathematics)"
            value={newSubjectName}
            onChange={(e) => setNewSubjectName(e.target.value)}
            className="flex-1 rounded-xl border-slate-200 border px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Subject
          </button>
        </form>

        {library.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-500">
            <FolderOpen className="h-12 w-12 mx-auto mb-4 text-slate-300" />
            No subjects yet. Create one above, then generate videos from the home page.
          </div>
        ) : (
          <div className="space-y-4">
            {library.map((subject) => (
              <div key={subject.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 bg-slate-50/80">
                  <button
                    type="button"
                    onClick={() => toggleSubject(subject.id)}
                    className="flex items-center gap-2 text-left font-semibold text-slate-800 hover:text-indigo-700"
                  >
                    {expandedSubjects[subject.id] ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    <FolderOpen className="h-5 w-5 text-indigo-500" />
                    {subject.name}
                    <span className="text-xs font-normal text-slate-400 ml-1">
                      ({subject.chapters.length} chapter{subject.chapters.length !== 1 ? 's' : ''})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSubject(subject.id)}
                    className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {expandedSubjects[subject.id] && (
                  <div className="px-5 py-4 space-y-3 border-t border-slate-100">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="New chapter name"
                        value={newChapterNames[subject.id] || ''}
                        onChange={(e) => setNewChapterNames((prev) => ({ ...prev, [subject.id]: e.target.value }))}
                        className="flex-1 rounded-lg border-slate-200 border px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleCreateChapter(subject.id)}
                        className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium"
                      >
                        <Plus className="h-3.5 w-3.5" /> Chapter
                      </button>
                    </div>

                    {subject.chapters.length === 0 ? (
                      <p className="text-sm text-slate-400 italic pl-1">No chapters yet.</p>
                    ) : (
                      subject.chapters.map((chapter) => (
                        <div key={chapter.id} className="ml-4 border-l-2 border-indigo-100 pl-4">
                          <button
                            type="button"
                            onClick={() => toggleChapter(chapter.id)}
                            className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-indigo-600 py-1"
                          >
                            {expandedChapters[chapter.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            {chapter.name}
                            <span className="text-xs text-slate-400">({chapter.videos.length} video{chapter.videos.length !== 1 ? 's' : ''})</span>
                          </button>

                          {expandedChapters[chapter.id] && (
                            <div className="mt-2 space-y-2">
                              {chapter.videos.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">No videos in this chapter.</p>
                              ) : (
                                chapter.videos.map((video) => (
                                  <button
                                    key={video.id}
                                    type="button"
                                    onClick={() => handlePlayVideo(video)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
                                      activeVideo?.id === video.id
                                        ? 'bg-indigo-50 border border-indigo-200'
                                        : 'bg-slate-50 hover:bg-slate-100 border border-transparent'
                                    }`}
                                  >
                                    <Video className="h-4 w-4 text-indigo-500 shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-slate-800 truncate">{video.title}</p>
                                      <p className="text-xs text-slate-400">{new Date(video.createdAt).toLocaleString()}</p>
                                    </div>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeVideo?.videoUrl && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">{activeVideo.title}</h2>
            <InteractiveVideoPlayer
              videoUrl={activeVideo.videoUrl}
              interactiveQuizzes={activeQuizzes}
              apiBaseUrl={API_BASE_URL}
            />
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
