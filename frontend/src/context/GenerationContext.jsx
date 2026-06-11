import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import api from '../lib/api';

const GenerationContext = createContext(null);

export function GenerationProvider({ children }) {
  const [jobs, setJobs] = useState([]);
  const pollRef = useRef(null);

  const pollJobs = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const activeRes = await api.get('/api/generation-jobs');
      const active = activeRes.data || [];
      setJobs((prev) => {
        const map = new Map(prev.map((j) => [j.id, j]));
        active.forEach((j) => map.set(j.id, { ...map.get(j.id), ...j }));
        return Array.from(map.values()).filter((j) => j.status === 'pending' || j.status === 'running' || j.status === 'completed');
      });

      for (const job of active) {
        if (job.status === 'pending' || job.status === 'running') {
          const detail = await api.get(`/api/generation-jobs/${job.id}`);
          setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, ...detail.data } : j)));
        }
      }
    } catch {
      // ignore poll errors
    }
  }, []);

  const trackJob = useCallback((jobId, meta = {}) => {
    setJobs((prev) => {
      if (prev.find((j) => j.id === jobId)) return prev;
      return [{ id: jobId, status: 'pending', ...meta }, ...prev];
    });
    pollJobs();
  }, [pollJobs]);

  const removeJob = useCallback((jobId) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  useEffect(() => {
    pollJobs();
    pollRef.current = setInterval(pollJobs, 4000);
    return () => clearInterval(pollRef.current);
  }, [pollJobs]);

  return (
    <GenerationContext.Provider value={{ jobs, trackJob, removeJob, pollJobs }}>
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration() {
  const ctx = useContext(GenerationContext);
  if (!ctx) throw new Error('useGeneration must be used within GenerationProvider');
  return ctx;
}
