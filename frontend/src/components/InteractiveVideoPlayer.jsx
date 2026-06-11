import { useRef, useState, useCallback, useEffect } from 'react';
import { Download, Play, Pause, Volume2, VolumeX } from 'lucide-react';

function formatTime(secs) {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function InteractiveVideoPlayer({ videoUrl, interactiveQuizzes = [], apiBaseUrl }) {
  const videoRef = useRef(null);
  const progressBarRef = useRef(null);
  const [activeQuiz, setActiveQuiz] = useState(null);
  // tracks which checkpoints have been answered at least once (for marker color)
  const [everAnswered, setEverAnswered] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hoveredQuiz, setHoveredQuiz] = useState(null);
  // ref so seek-guard can read latest value without stale closure
  const everAnsweredRef = useRef({});
  const activeQuizRef = useRef(null);
  // timestamp of the last checkpoint that was triggered — cleared once currentTime moves past it
  const lastTriggeredTimestampRef = useRef(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => setDuration(v.duration);
    v.addEventListener('loadedmetadata', onLoaded);
    return () => v.removeEventListener('loadedmetadata', onLoaded);
  }, []);

  // Returns the first checkpoint the user would skip over when seeking to `toTime`
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

    // clear the cooldown once playback has moved past the trigger window
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

  const handleQuizSubmit = (selectedIndex) => {
    if (!activeQuiz) return;
    setFeedback({ isCorrect: selectedIndex === activeQuiz.correct_index, correctIndex: activeQuiz.correct_index });
    everAnsweredRef.current = { ...everAnsweredRef.current, [activeQuiz.timestamp_seconds]: true };
    setEverAnswered({ ...everAnsweredRef.current });
  };

  const handleContinue = () => {
    const v = videoRef.current;
    // set cooldown before clearing activeQuizRef so timeupdate can't re-fire immediately
    if (activeQuiz) lastTriggeredTimestampRef.current = activeQuiz.timestamp_seconds;
    activeQuizRef.current = null;
    setActiveQuiz(null);
    setFeedback(null);
    if (v) v.play();
    setIsPlaying(true);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setIsPlaying(true); }
    else { v.pause(); setIsPlaying(false); }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
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

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900">Interactive Video Player</h2>
        <a
          href={`${apiBaseUrl}${videoUrl}`}
          download="lesson.mp4"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center px-4 py-2 border border-gray-200 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
        >
          <Download className="h-4 w-4 mr-2" />
          Download
        </a>
      </div>

      {/* Video */}
      <div className="relative w-full rounded-2xl shadow-lg bg-slate-900 overflow-hidden aspect-video ring-1 ring-black/5">
        <video
          ref={videoRef}
          src={`${apiBaseUrl}${videoUrl}`}
          onTimeUpdate={handleVideoTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onLoadedMetadata={(e) => setDuration(e.target.duration)}
          className="w-full h-full object-contain"
        />

        {activeQuiz && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 z-10">
            <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 sm:p-8 animate-in fade-in zoom-in duration-200">
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                  Quick Check
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-6 leading-snug">
                {activeQuiz.question}
              </h3>
              {!feedback ? (
                <div className="space-y-3">
                  {activeQuiz.options.map((option, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleQuizSubmit(idx)}
                      className="w-full py-3.5 px-5 text-left border-2 border-slate-100 hover:border-indigo-400 hover:bg-indigo-50 rounded-xl transition-all text-slate-700 font-medium"
                    >
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-sm font-bold mr-3">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      {option}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className={`rounded-xl p-4 text-sm font-medium ${
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

      {/* Custom Controls */}
      <div className="bg-slate-900 rounded-2xl px-4 py-3 space-y-2">
        {/* Progress bar with checkpoint markers */}
        <div
          ref={progressBarRef}
          className="relative h-2 bg-slate-700 rounded-full cursor-pointer group"
          onClick={handleProgressClick}
        >
          {/* Played portion */}
          <div
            className="absolute left-0 top-0 h-full bg-indigo-500 rounded-full pointer-events-none"
            style={{ width: `${progress}%` }}
          />
          {/* Scrubber thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `calc(${progress}% - 7px)` }}
          />

          {/* Checkpoint markers */}
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
              >
                {/* Marker diamond */}
                <div
                  className={`w-3 h-3 rotate-45 border-2 transition-colors ${
                    answered
                      ? 'bg-emerald-400 border-emerald-300'
                      : 'bg-amber-400 border-amber-300'
                  }`}
                />
                {/* Tooltip */}
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

        {/* Controls row */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            className="text-white hover:text-indigo-400 transition-colors"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>

          <button
            type="button"
            onClick={toggleMute}
            className="text-white hover:text-indigo-400 transition-colors"
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>

          <span className="text-xs text-slate-400 tabular-nums ml-1">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          {interactiveQuizzes.length > 0 && (
            <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
              <span className="w-2.5 h-2.5 rotate-45 bg-amber-400 inline-block" />
              {interactiveQuizzes.length} checkpoint{interactiveQuizzes.length !== 1 ? 's' : ''}
              {Object.keys(everAnswered).length > 0 && (
                <span className="text-emerald-400 ml-1">
                  ({Object.keys(everAnswered).length} done)
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default InteractiveVideoPlayer;
