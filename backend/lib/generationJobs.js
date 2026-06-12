const db = require('../db/index');
const { friendlyLlmError } = require('./llmClient');

// ─── Concurrency queue ────────────────────────────────────────────────────────
// Running 10 jobs simultaneously exhausts all Groq API keys, saturates CPU with
// parallel FFmpeg processes, and causes everything to deadlock. Cap at 2 so jobs
// share API keys politely and FFmpeg doesn't fight itself for CPU.
const MAX_CONCURRENT = 2;
let runningCount = 0;
const jobQueue = []; // [{ jobId, runner }]

function dequeueNext() {
  if (runningCount >= MAX_CONCURRENT || jobQueue.length === 0) return;
  const { jobId, runner } = jobQueue.shift();
  runningCount++;
  runLessonVideoJob(jobId, runner)
    .catch((err) => console.error(`Job ${jobId} failed:`, friendlyLlmError(err)))
    .finally(() => {
      runningCount--;
      dequeueNext();
    });
}

// ─── Cancellation ─────────────────────────────────────────────────────────────
// In-memory set — no DB round-trip needed per stage check.
const cancelledJobs = new Set();

function isCancelled(jobId) {
  return cancelledJobs.has(jobId);
}

async function cancelJob(jobId, userId) {
  cancelledJobs.add(jobId);
  try {
    await db.generationJob.updateMany({
      where: { id: jobId, ...(userId ? { userId } : {}) },
      data: {
        status: 'cancelled',
        error: 'Cancelled by user',
        progress: JSON.stringify({ step: 'cancelled', percent: 0 }),
        updatedAt: new Date(),
      },
    });
    // Reset chapter status so the user can regenerate
    const job = await db.generationJob.findUnique({ where: { id: jobId } });
    if (job?.chapterId) {
      await db.chapter.update({
        where: { id: job.chapterId },
        data: { generationStatus: 'planned' },
      }).catch(() => {});
    }
  } catch (err) {
    console.error('cancelJob db error:', err.message);
  }
}

// ─── Core job helpers ─────────────────────────────────────────────────────────
async function createJob({ userId, chapterId, subjectId, type }) {
  return db.generationJob.create({
    data: {
      userId,
      chapterId: chapterId || null,
      subjectId: subjectId || null,
      type,
      status: 'pending',
      progress: JSON.stringify({ step: 'queued', percent: 0 }),
    },
  });
}

async function updateJob(jobId, data) {
  return db.generationJob.update({
    where: { id: jobId },
    data: { ...data, updatedAt: new Date() },
  });
}

function createThrottledProgress(jobId) {
  let lastWrite = 0;
  let lastStep = '';
  let lastPercent = -1;

  return async (step, percent) => {
    const now = Date.now();
    const changed = step !== lastStep || Math.abs(percent - lastPercent) >= 5;
    if (!changed && now - lastWrite < 4000 && percent < 95) return;

    lastWrite = now;
    lastStep = step;
    lastPercent = percent;
    await updateJob(jobId, {
      progress: JSON.stringify({ step, percent }),
    });
  };
}

async function runLessonVideoJob(jobId, runner) {
  if (isCancelled(jobId)) return; // cancelled while waiting in queue

  await updateJob(jobId, {
    status: 'running',
    progress: JSON.stringify({ step: 'generating', percent: 10 }),
  });

  const onProgress = createThrottledProgress(jobId);

  try {
    const result = await runner(onProgress, () => isCancelled(jobId));

    if (isCancelled(jobId)) {
      // Job finished but was cancelled — don't mark as completed
      console.log(`Job ${jobId} completed but was cancelled — discarding result`);
      return;
    }

    await updateJob(jobId, {
      status: 'completed',
      progress: JSON.stringify({ step: 'done', percent: 100 }),
      resultJson: JSON.stringify(result),
    });

    return result;
  } catch (err) {
    if (isCancelled(jobId)) return; // suppress error noise for cancelled jobs

    const message = friendlyLlmError(err);
    await updateJob(jobId, {
      status: 'failed',
      error: message,
      progress: JSON.stringify({ step: 'failed', percent: 0 }),
    });
    const job = await db.generationJob.findUnique({ where: { id: jobId } });
    if (job?.chapterId) {
      await db.chapter.update({
        where: { id: job.chapterId },
        data: { generationStatus: 'failed' },
      }).catch(() => {});
    }
    throw err;
  }
}

function startBackgroundJob(jobId, runner) {
  if (runningCount < MAX_CONCURRENT) {
    runningCount++;
    setImmediate(() => {
      runLessonVideoJob(jobId, runner)
        .catch((err) => console.error(`Job ${jobId} failed:`, friendlyLlmError(err)))
        .finally(() => {
          runningCount--;
          dequeueNext();
        });
    });
  } else {
    // Queue the job — update DB so UI shows "queued" status
    jobQueue.push({ jobId, runner });
    updateJob(jobId, {
      progress: JSON.stringify({ step: 'queued', percent: 0 }),
    }).catch(() => {});
    console.log(`Job ${jobId} queued (${jobQueue.length} waiting, ${runningCount}/${MAX_CONCURRENT} running)`);
  }
}

module.exports = {
  createJob,
  updateJob,
  cancelJob,
  isCancelled,
  startBackgroundJob,
};
