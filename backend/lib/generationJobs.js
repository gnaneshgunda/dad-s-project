const db = require('../db/index');

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

async function runLessonVideoJob(jobId, runner) {
  await updateJob(jobId, {
    status: 'running',
    progress: JSON.stringify({ step: 'generating', percent: 10 }),
  });

  try {
    const result = await runner(async (step, percent) => {
      await updateJob(jobId, {
        progress: JSON.stringify({ step, percent }),
      });
    });

    await updateJob(jobId, {
      status: 'completed',
      progress: JSON.stringify({ step: 'done', percent: 100 }),
      resultJson: JSON.stringify(result),
    });

    return result;
  } catch (err) {
    await updateJob(jobId, {
      status: 'failed',
      error: err.message || 'Generation failed',
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
      console.error(`Job ${jobId} failed:`, err.message);
    });
  });
}

module.exports = {
  createJob,
  updateJob,
  startBackgroundJob,
};
