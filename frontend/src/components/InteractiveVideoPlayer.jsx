import { useRef, useState, useCallback, useEffect } from 'react';
import { Download, Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, Loader2, AlertCircle } from 'lucide-react';

function formatTime(secs) {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function InteractiveVideoPlayer({
  videoUrl,
  interactiveQuizzes = [],
  apiBaseUrl,
  embedded = false,
  showHeader = true,
  onLessonComplete,
  className = '',
}) {
  const playerRef = useRef(null);
  const videoRef = useRef(null);
  const progressBarRef = useRef(null);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [everAnswered, setEverAnswered] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hoveredQuiz, setHoveredQuiz] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const everAnsweredRef = useRef({});
  const activeQuizRef = useRef(null);
  const lastTriggeredTimestampRef = useRef(null);
  const completedRef = useRef(false);

  useEffect(() => {
    completedRef.current = false;
    setEverAnswered({});
    everAnsweredRef.current = {};
    setActiveQuiz(null);
    activeQuizRef.current = null;
    setCurrentTime(0);
    setDuration(0);
    setIsBuffering(true);
    setLoadError(null);
  }, [videoUrl]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const firstSkippedUnanswered = useCallback((fromTime, toTime) => {
    if (toTime <= fromTime) return null;
    return interactiveQuizzes
      .filter((q) => q.timestamp_seconds > fromTime && q.timestamp_seconds <= toTime && !everAnsweredRef.current[q.timestamp_seconds])
      .sort((a, b) => a.timestamp_seconds - b.timestamp_seconds)[0] || null;
  }, [interactiveQuizzes]);

  const triggerQuiz = useCallback((quiz) => {
    const v = videoRef.current;
    if (!v) return;
    lastTriggeredTimestampRef.current = quiz.timestamp_seconds;
    v.pause();
    setIsPlaying(false);
    setCurrentTime(v.currentTime);
    setActiveQuiz(quiz);
    activeQuizRef.current = quiz;
    setFeedback(null);
  }, []);

  const handleVideoTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || interactiveQuizzes.length === 0 || activeQuizRef.current) return;
    setCurrentTime(v.currentTime);

    if (
      lastTriggeredTimestampRef.current !== null &&
      v.currentTime >= lastTriggeredTimestampRef.current + 0.8
    ) {
      lastTriggeredTimestampRef.current = null;
    }

    if (lastTriggeredTimestampRef.current !== null) return;

    const quizToTrigger = interactiveQuizzes.find(
      (q) => v.currentTime >= q.timestamp_seconds && v.currentTime < q.timestamp_seconds + 0.75
    );
    if (quizToTrigger) triggerQuiz(quizToTrigger);
  }, [interactiveQuizzes, triggerQuiz]);

  const handleEnded = () => {
    setIsPlaying(false);
    if (!completedRef.current && onLessonComplete) {
      completedRef.current = true;
      onLessonComplete();
    }
  };

  const handleQuizSubmit = (selectedIndex) => {
    if (!activeQuiz) return;
    setFeedback({ isCorrect: selectedIndex === activeQuiz.correct_index, correctIndex: activeQuiz.correct_index });
    everAnsweredRef.current = { ...everAnsweredRef.current, [activeQuiz.timestamp_seconds]: true };
    setEverAnswered({ ...everAnsweredRef.current });
  };

  const handleContinue = () => {
    const v = videoRef.current;
    if (activeQuiz) lastTriggeredTimestampRef.current = activeQuiz.timestamp_seconds;
    activeQuizRef.current = null;
    setActiveQuiz(null);
    setFeedback(null);
    if (v) v.play();
    setIsPlaying(true);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v || loadError) return;
    if (v.paused) { v.play(); setIsPlaying(true); }
    else { v.pause(); setIsPlaying(false); }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };

  const toggleFullscreen = async () => {
    if (!playerRef.current) return;
    if (!document.fullscreenElement) {
      await playerRef.current.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  };

  const handleProgressClick = (e) => {
    const bar = progressBarRef.current;
    const v = videoRef.current;
    if (!bar || !v || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * duration;
    const blocked = firstSkippedUnanswered(v.currentTime, targetTime);
    if (blocked) { triggerQuiz(blocked); return; }
    v.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;
  const src = videoUrl.startsWith('http') ? videoUrl : `${apiBaseUrl}${videoUrl}`;

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      {showHeader && !embedded && (
        <div className="flex justify-between items-center mb-4 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Interactive Video Player</h2>
          <a
            href={src}
            download="lesson.mp4"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center px-4 py-2 border border-gray-200 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </a>
        </div>
      )}

      {/* Fullscreen wraps video + controls together */}
      <div
        ref={playerRef}
        className={`flex flex-col flex-1 min-h-0 bg-slate-900 ${
          embedded ? 'rounded-xl ring-1 ring-black/10' : 'rounded-2xl shadow-lg ring-1 ring-black/5'
        } ${isFullscreen ? 'rounded-none justify-end' : ''}`}
      >
        <div className={`relative w-full bg-black flex-1 min-h-[180px] ${embedded ? '' : 'aspect-video'} ${isFullscreen ? 'flex-1' : ''}`}>
          <video
            ref={videoRef}
            src={src}
            preload="auto"
            onTimeUpdate={handleVideoTimeUpdate}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={handleEnded}
            onLoadStart={() => { setIsBuffering(true); setLoadError(null); }}
            onWaiting={() => setIsBuffering(true)}
            onCanPlay={() => setIsBuffering(false)}
            onLoadedMetadata={(e) => { setDuration(e.target.duration); setIsBuffering(false); }}
            onError={() => { setLoadError('Failed to load video'); setIsBuffering(false); }}
            className="w-full h-full object-contain"
            playsInline
          />

          {isBuffering && !loadError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 z-10 gap-3">
              <Loader2 className="h-10 w-10 text-indigo-400 animate-spin" />
              <p className="text-sm text-slate-300">Loading video…</p>
            </div>
          )}

          {loadError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 z-10 gap-2 p-4 text-center">
              <AlertCircle className="h-10 w-10 text-red-400" />
              <p className="text-sm text-red-200">{loadError}</p>
            </div>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            className="absolute top-3 right-3 z-20 p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          {activeQuiz && (
            <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-8 z-30">
              <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl max-h-[90vh] overflow-y-auto p-5 sm:p-8">
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                    Quick Check
                  </span>
                </div>
                <h3 className="text-base sm:text-xl font-bold text-slate-900 mb-4 leading-snug">
                  {activeQuiz.question}
                </h3>
                {!feedback ? (
                  <div className="space-y-2.5">
                    {activeQuiz.options.map((option, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleQuizSubmit(idx)}
                        className="w-full py-3 px-4 text-left border-2 border-slate-100 hover:border-indigo-400 hover:bg-indigo-50 rounded-xl transition-all text-slate-700 text-sm font-medium"
                      >
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold mr-2.5 shrink-0">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        {option}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className={`rounded-xl p-3.5 text-sm font-medium ${
                      feedback.isCorrect
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}>
                      {feedback.isCorrect
                        ? 'Correct! Great job.'
                        : `Not quite. The correct answer was "${activeQuiz.options[feedback.correctIndex]}".`}
                    </div>
                    <button
                      type="button"
                      onClick={handleContinue}
                      className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors"
                    >
                      Continue Lesson
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Controls stay inside fullscreen container */}
        <div className={`px-4 py-3 space-y-2 shrink-0 ${isFullscreen ? 'pb-4' : ''}`}>
          <div
            ref={progressBarRef}
            className="relative h-2.5 bg-slate-700 rounded-full cursor-pointer group"
            onClick={handleProgressClick}
          >
            <div
              className="absolute left-0 top-0 h-full bg-indigo-500 rounded-full pointer-events-none"
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${progress}% - 7px)` }}
            />

            {duration > 0 && interactiveQuizzes.map((q, i) => {
              const pct = (q.timestamp_seconds / duration) * 100;
              const answered = everAnswered[q.timestamp_seconds];
              return (
                <div
                  key={i}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer z-10"
                  style={{ left: `${pct}%` }}
                  onMouseEnter={() => setHoveredQuiz(i)}
                  onMouseLeave={() => setHoveredQuiz(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    const v = videoRef.current;
                    if (!v) return;
                    const blocked = firstSkippedUnanswered(v.currentTime, q.timestamp_seconds);
                    if (blocked && blocked.timestamp_seconds !== q.timestamp_seconds) {
                      triggerQuiz(blocked);
                      return;
                    }
                    v.currentTime = q.timestamp_seconds;
                    setCurrentTime(q.timestamp_seconds);
                    triggerQuiz(q);
                  }}
                >
                  <div
                    className={`w-3 h-3 rotate-45 border-2 transition-colors ${
                      answered ? 'bg-emerald-400 border-emerald-300' : 'bg-amber-400 border-amber-300'
                    }`}
                  />
                  {hoveredQuiz === i && (
                    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap pointer-events-none shadow-lg z-20">
                      <div className="font-semibold text-amber-300 mb-0.5">Checkpoint {i + 1}</div>
                      <div className="text-slate-300">{formatTime(q.timestamp_seconds)}</div>
                      {answered && <div className="text-emerald-400 mt-0.5">✓ Answered</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={togglePlay} disabled={!!loadError} className="text-white hover:text-indigo-400 transition-colors disabled:opacity-40">
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button type="button" onClick={toggleMute} className="text-white hover:text-indigo-400 transition-colors">
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <span className="text-xs text-slate-300 tabular-nums ml-1">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            {interactiveQuizzes.length > 0 && (
              <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
                <span className="w-2.5 h-2.5 rotate-45 bg-amber-400 inline-block" />
                {interactiveQuizzes.length} checkpoint{interactiveQuizzes.length !== 1 ? 's' : ''}
                {Object.keys(everAnswered).length > 0 && (
                  <span className="text-emerald-400 ml-1">({Object.keys(everAnswered).length} done)</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default InteractiveVideoPlayer;
