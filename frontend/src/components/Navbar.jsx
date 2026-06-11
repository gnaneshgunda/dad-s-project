import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, Library, User, LogOut, LogIn, UserPlus, Globe, GraduationCap } from 'lucide-react';

const navLinks = [
  { to: '/', label: 'Studio', icon: Sparkles },
  { to: '/explore', label: 'Explore', icon: Globe },
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
    <>
      <nav className="sticky top-0 z-40 border-b border-white/10 bg-slate-900/90 backdrop-blur-xl hidden sm:block">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <GraduationCap className="h-5 w-5 text-white" />
              </div>
              <span className="text-white font-bold text-xl tracking-tight">EduAI</span>
            </Link>

            {token && (
              <div className="flex items-center gap-1">
                {navLinks.map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      location.pathname === to || (to !== '/' && location.pathname.startsWith(to))
                        ? 'bg-white/15 text-white'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              {token ? (
                <button type="button" onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10">
                  <LogOut className="h-4 w-4" /><span className="hidden md:inline">Logout</span>
                </button>
              ) : (
                <>
                  <Link to="/login" className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm text-slate-300 hover:text-white hover:bg-white/10">
                    <LogIn className="h-4 w-4" /> Login
                  </Link>
                  <Link to="/signup" className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm bg-white text-slate-900 hover:bg-slate-100">
                    <UserPlus className="h-4 w-4" /> Sign Up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {token && (
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900 border-t border-white/10 px-2 py-2">
          <div className="flex justify-around">
            {navLinks.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-xs ${
                  location.pathname === to ? 'text-indigo-400' : 'text-slate-400'
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </>
  );
}
