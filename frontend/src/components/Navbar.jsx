import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Sparkles, Library, User, LogOut, LogIn, UserPlus } from 'lucide-react';

const navLinks = [
  { to: '/', label: 'Studio', icon: Sparkles },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/profile', label: 'Profile', icon: User },
];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem('token');

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <nav className="sticky top-0 z-40 border-b border-white/10 bg-slate-900/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-white font-bold text-xl tracking-tight">EduAI</span>
          </Link>

          {token && (
            <div className="hidden sm:flex items-center gap-1">
              {navLinks.map(({ to, label, icon: Icon }) => {
                const active = location.pathname === to;
                return (
                  <Link
                    key={to}
                    to={to}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      active
                        ? 'bg-white/15 text-white'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2">
            {token ? (
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            ) : (
              <>
                <Link
                  to="/login"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <LogIn className="h-4 w-4" /> Login
                </Link>
                <Link
                  to="/signup"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-white text-slate-900 hover:bg-slate-100 transition-colors"
                >
                  <UserPlus className="h-4 w-4" /> Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
