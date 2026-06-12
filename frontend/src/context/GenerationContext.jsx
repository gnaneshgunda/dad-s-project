import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import api from '../lib/api';

const GenerationContext = createContext(null);

export function GenerationProvider({ children }) {
  const [jobs, setJobs] = useState([]);
  const hasActiveRef = useRef(false);

  const pollJobs = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const activeRes = await api.get('/api/generation-jobs');
      const incoming = activeRes.data || [];
      hasActiveRef.current = incoming.some((j) => j.status === 'pending' || j.status === 'running');

      setJobs((prev) => {
        const map = new Map();
        prev.forEach((j) => map.set(j.id, j));
        incoming.forEach((j) => map.set(j.id, { ...map.get(j.id), ...j }));
        return Array.from(map.values())
          .filter((j) => {
            if (j.status === 'pending' || j.status === 'running') return true;
            if (j.status === 'completed' || j.status === 'failed') {
              const updated = j.updatedAt ? new Date(j.updatedAt).getTime() : Date.now();
              return Date.now() - updated < 3 * 60 * 1000;
            }
            return false;
          })
          .sort((a, b) => b.id - a.id);
      });
    } catch {
      // backend may be offline — don't spam
    }
  }, []);

  const trackJob = useCallback((jobId, meta = {}) => {
    hasActiveRef.current = true;
    setJobs((prev) => {
      if (prev.find((j) => j.id === jobId)) return prev;
      return [{ id: jobId, status: 'pending', progressData: { step: 'queued', percent: 0 }, ...meta }, ...prev];
    });
    pollJobs();
  }, [pollJobs]);

  const removeJob = useCallback((jobId) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer;

    const tick = async () => {
      await pollJobs();
      if (!cancelled) {
        timer = setTimeout(tick, hasActiveRef.current ? 2500 : 12000);
      }
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
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
