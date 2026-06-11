import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, User, Mail, Calendar, Lock, Video, ChevronRight, Save } from 'lucide-react';
import api from '../lib/api';
import Toast from '../components/Toast';

function getInitials(email, name) {
  if (name?.trim()) {
    return name.trim().split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  }
  return (email?.[0] || 'U').toUpperCase();
}

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api.get('/api/profile')
      .then((res) => {
        setProfile(res.data);
        setName(res.data.user.name || '');
      })
      .catch(() => setToast({ message: 'Failed to load profile', type: 'error' }))
      .finally(() => setLoading(false));
  }, []);

  const handleSaveName = async (e) => {
    e.preventDefault();
    setSavingName(true);
    try {
      const res = await api.put('/api/profile', { name });
      const updatedUser = res.data;
      setProfile((prev) => ({ ...prev, user: { ...prev.user, ...updatedUser, name: updatedUser.name ?? name } }));
      setToast({ message: 'Profile updated!', type: 'success' });
    } catch {
      setToast({ message: 'Failed to update profile', type: 'error' });
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setToast({ message: 'Passwords do not match', type: 'error' });
      return;
    }
    setSavingPassword(true);
    try {
      await api.put('/api/profile/password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setToast({ message: 'Password changed successfully!', type: 'success' });
    } catch (err) {
      setToast({ message: err.response?.data?.error || 'Failed to change password', type: 'error' });
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-indigo-600" />
      </div>
    );
  }

  const { user, stats, recentVideos } = profile || {};

  return (
    <div className="min-h-screen py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Profile</h1>
          <p className="mt-1 text-slate-500">Manage your account and view your learning activity.</p>
        </div>

        {/* Profile card */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="h-28 bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600" />
          <div className="px-6 pb-6">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12">
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold border-4 border-white shadow-lg">
                {getInitials(user?.email, user?.name)}
              </div>
              <div className="flex-1 pb-1">
                <h2 className="text-2xl font-bold text-slate-900">{user?.name || 'Learner'}</h2>
                <p className="text-slate-500 flex items-center gap-1.5 mt-1">
                  <Mail className="h-4 w-4" /> {user?.email}
                </p>
                {user?.createdAt && (
                  <p className="text-slate-400 text-sm flex items-center gap-1.5 mt-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Member since {new Date(user.createdAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Subjects', value: stats.subjects },
              { label: 'Chapters', value: stats.chapters },
              { label: 'Videos', value: stats.videos },
              { label: 'Drafts', value: stats.historyItems },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-5 text-center">
                <p className="text-3xl font-bold text-indigo-600">{s.value}</p>
                <p className="text-sm text-slate-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Edit name */}
          <form onSubmit={handleSaveName} className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <User className="h-5 w-5 text-indigo-500" /> Display Name
            </h3>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-xl border-slate-200 border px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={savingName}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
          </form>

          {/* Change password */}
          <form onSubmit={handleChangePassword} className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Lock className="h-5 w-5 text-indigo-500" /> Change Password
            </h3>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              className="w-full rounded-xl border-slate-200 border px-4 py-3 focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className="w-full rounded-xl border-slate-200 border px-4 py-3 focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="w-full rounded-xl border-slate-200 border px-4 py-3 focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={savingPassword}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white rounded-xl font-medium hover:bg-slate-900 disabled:opacity-50"
            >
              {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Update Password
            </button>
          </form>
        </div>

        {/* Recent videos */}
        {recentVideos?.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Recent Lessons</h3>
              <Link to="/library" className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                View all <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="space-y-2">
              {recentVideos.map((v) => (
                <div key={v.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600">
                    <Video className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">{v.title}</p>
                    <p className="text-xs text-slate-400">
                      {v.chapter?.subject?.name} → {v.chapter?.name}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">
                    {new Date(v.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
