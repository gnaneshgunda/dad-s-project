import { Link, useNavigate } from 'react-router-dom';

function Navbar() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <nav className="bg-purple-700 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link to="/" className="text-white font-bold text-xl">EduAI</Link>
            </div>
            {token && (
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link
                  to="/"
                  className="border-transparent text-purple-100 hover:bg-purple-600 hover:text-white inline-flex items-center px-3 py-2 border-b-2 text-sm font-medium rounded-md mt-3 mb-3"
                >
                  Generate
                </Link>
                <Link
                  to="/history"
                  className="border-transparent text-purple-100 hover:bg-purple-600 hover:text-white inline-flex items-center px-3 py-2 border-b-2 text-sm font-medium rounded-md mt-3 mb-3"
                >
                  History
                </Link>
              </div>
            )}
          </div>
          <div className="flex items-center">
            {token ? (
              <button
                onClick={handleLogout}
                className="text-purple-100 hover:bg-purple-600 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Logout
              </button>
            ) : (
              <div className="space-x-4">
                <Link
                  to="/login"
                  className="text-purple-100 hover:bg-purple-600 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  className="bg-white text-purple-700 hover:bg-purple-50 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
