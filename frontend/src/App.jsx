import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import GenerationBanner from './components/GenerationBanner';
import { GenerationProvider } from './context/GenerationContext';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Library from './pages/Library';
import Profile from './pages/Profile';
import Course from './pages/Course';
import Explore from './pages/Explore';
import ExplorePreview from './pages/ExplorePreview';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <Router>
      <GenerationProvider>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 sm:pb-0 pb-16">
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
            <Route
              path="/history"
              element={<Navigate to="/library" replace />}
            />
          </Routes>
        </main>
        <GenerationBanner />
      </div>
      </GenerationProvider>
    </Router>
  );
}

export default App;
