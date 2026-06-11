import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Loader2, Eye, EyeOff, Sparkles } from 'lucide-react';
import api from '../lib/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/api/login', { email, password });
      localStorage.setItem('token', response.data.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 items-center justify-center mb-4 shadow-lg shadow-indigo-200">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">Welcome back</h1>
          <p className="text-slate-500 mt-2">Sign in to your EduAI account</p>
        </div>

        <form onSubmit={handleLogin} className="card p-8 space-y-5">
          {error && <div className="text-rose-600 text-sm text-center bg-rose-50 border border-rose-100 p-3 rounded-xl">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} className="input-field pr-12" placeholder="••••••••" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Sign in'}
          </button>
          <p className="text-sm text-center text-slate-500">
            No account? <Link to="/signup" className="text-indigo-600 font-medium hover:text-indigo-700">Create one</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
