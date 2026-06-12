import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import api from '../lib/api';

const GenerationContext = createContext(null);

export function GenerationProvider({ children }) {
  const [jobs, setJobs] = useState([]);
  const hasActiveRef = useRef(false);
  const tabVisibleRef = useRef(true);
  const dismissedFailedRef = useRef(new Set(
    JSON.parse(sessionStorage.getItem('dismissedFailedJobs') || '[]')
  ));

  const pollJobs = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token || !tabVisibleRef.current) return;

    try {
      const activeRes = await api.get('/api/generation-jobs');
      const incoming = activeRes.data || [];
      hasActiveRef.current = incoming.some((j) => j.status === 'pending' || j.status === 'running');

      setJobs((prev) => {
        const map = new Map();
        prev.forEach((j) => map.set(j.id, j));
        incoming.forEach((j) => {
          const existing = map.get(j.id);
          map.set(j.id, {
            ...existing,
            ...j,
            dismissed: dismissedFailedRef.current.has(j.id) || existing?.dismissed,
          });
        });
        return Array.from(map.values())
          .filter((j) => {
            if (j.status === 'pending' || j.status === 'running') return true;
            if (j.status === 'completed') {
              const updated = j.updatedAt ? new Date(j.updatedAt).getTime() : Date.now();
              return Date.now() - updated < 2 * 60 * 1000;
            }
            if (j.status === 'failed') {
              return !dismissedFailedRef.current.has(j.id);
            }
            return false;
          })
          .sort((a, b) => b.id - a.id);
      });
    } catch {
      // skip tick on network/db errors
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

  const dismissFailed = useCallback((jobId) => {
    dismissedFailedRef.current.add(jobId);
    sessionStorage.setItem(
      'dismissedFailedJobs',
      JSON.stringify([...dismissedFailedRef.current].slice(-50))
    );
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, dismissed: true } : j))
      .filter((j) => !(j.status === 'failed' && j.dismissed)));
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      tabVisibleRef.current = document.visibilityState === 'visible';
      if (tabVisibleRef.current) pollJobs();
    };
    document.addEventListener('visibilitychange', onVisibility);

    let cancelled = false;
    let timer;

    const tick = async () => {
      await pollJobs();
      if (!cancelled) {
        const ms = !tabVisibleRef.current
          ? 60000
          : hasActiveRef.current
            ? 5000
            : 30000;
        timer = setTimeout(tick, ms);
      }
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [pollJobs]);

  const cancelJob = useCallback(async (jobId) => {
    // Optimistically remove from local state immediately
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    try {
      await api.delete(`/api/generation-jobs/${jobId}`);
    } catch {
      // Non-fatal — the backend cancellation may still have succeeded
    }
    pollJobs();
  }, [pollJobs]);

  return (
    <GenerationContext.Provider value={{ jobs, trackJob, removeJob, dismissFailed, cancelJob, pollJobs }}>
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration() {
  const ctx = useContext(GenerationContext);
  if (!ctx) throw new Error('useGeneration must be used within GenerationProvider');
  return ctx;
}
