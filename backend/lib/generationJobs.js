const db = require('../db/index');
const { friendlyLlmError } = require('./llmClient');

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
  await updateJob(jobId, {
    status: 'running',
    progress: JSON.stringify({ step: 'generating', percent: 10 }),
  });

  const onProgress = createThrottledProgress(jobId);

  try {
    const result = await runner(onProgress);

    await updateJob(jobId, {
      status: 'completed',
      progress: JSON.stringify({ step: 'done', percent: 100 }),
      resultJson: JSON.stringify(result),
    });

    return result;
  } catch (err) {
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
  setImmediate(() => {
    runLessonVideoJob(jobId, runner).catch((err) => {
      console.error(`Job ${jobId} failed:`, friendlyLlmError(err));
    });
  });
}

module.exports = {
  createJob,
  updateJob,
  startBackgroundJob,
};
