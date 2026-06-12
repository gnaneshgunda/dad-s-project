import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import GenerationBanner from './components/GenerationBanner';
import { GenerationProvider } from './context/GenerationContext';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Library from './pages/Library';
import Profile from './pages/Profile';
import Course from './pages/Course';
import MyCourses from './pages/MyCourses';
import Explore from './pages/Explore';
import ExplorePreview from './pages/ExplorePreview';
import About from './pages/About';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
}

function AppShell() {
  const location = useLocation();
  const immersive = location.pathname.startsWith('/course/');

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className={immersive ? 'flex-1 min-h-0 overflow-hidden' : 'flex-1 sm:pb-0 pb-16'}>
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <Home />
                </PrivateRoute>
              }
            />
            <Route
              path="/courses"
              element={
                <PrivateRoute>
                  <MyCourses />
                </PrivateRoute>
              }
            />
            <Route
              path="/library"
              element={
                <PrivateRoute>
                  <Library />
                </PrivateRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <PrivateRoute>
                  <Profile />
                </PrivateRoute>
              }
            />
            <Route
              path="/course/:id"
              element={
                <PrivateRoute>
                  <Course />
                </PrivateRoute>
              }
            />
            <Route
              path="/explore"
              element={
                <PrivateRoute>
                  <Explore />
                </PrivateRoute>
              }
            />
            <Route
              path="/explore/:id"
              element={
                <PrivateRoute>
                  <ExplorePreview />
                </PrivateRoute>
              }
            />
            <Route path="/about" element={<About />} />
            <Route
              path="/history"
              element={<Navigate to="/library" replace />}
            />
        </Routes>
      </main>
      <GenerationBanner />
    </div>
  );
}

function App() {
  return (
    <Router>
      <GenerationProvider>
        <AppShell />
      </GenerationProvider>
    </Router>
  );
}

export default App;
