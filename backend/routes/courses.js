const express = require('express');
const db = require('../db/index');
const authMiddleware = require('../middleware/auth');
const {
  buildCurriculumPrompt,
  buildScopeClassifierPrompt,
  parseCurriculumResponse,
  parseScopeResponse,
} = require('../lib/llmPrompts');
const { normalizeSearchQuery, flattenCurriculumLessons } = require('../lib/courseUtils');
const { createJob, startBackgroundJob, cancelJob } = require('../lib/generationJobs');
const { getWatchedChapterIds, buildCourseProgress } = require('../lib/progressUtils');

const router = express.Router();

function initCoursesRouter({ callLlm, generateVideo, audioDir, videoDir }) {
  router.get('/courses/search', authMiddleware, async (req, res) => {
    const q = normalizeSearchQuery(req.query.q);
    if (!q) return res.json({ matches: [] });

    try {
      const matches = await db.subject.findMany({
        where: {
          isPublic: true,
          OR: [
            { searchQuery: q },
            { searchQuery: { contains: q } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
          NOT: { userId: req.user.id },
        },
        include: {
          user: { select: { id: true, email: true, name: true } },
          chapters: {
            orderBy: { sortOrder: 'asc' },
            include: { videos: { take: 1, orderBy: { createdAt: 'desc' } } },
          },
          _count: { select: { chapters: true } },
        },
        take: 5,
      });

      const enriched = matches.map((s) => ({
        ...s,
        lessonCount: s.chapters.length,
        completedLessons: s.chapters.filter((c) => c.videos.length > 0).length,
        ownerLabel: s.user.name || s.user.email.split('@')[0],
      }));

      res.json({ matches: enriched, normalizedQuery: q });
    } catch (err) {
      console.error('Course search error:', err);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  router.get('/courses/public/:id/preview', authMiddleware, async (req, res) => {
    const id = Number(req.params.id);
    try {
      const subject = await db.subject.findFirst({
        where: { id, isPublic: true },
        include: {
          user: { select: { email: true, name: true } },
          chapters: { orderBy: { sortOrder: 'asc' } },
        },
      });
      if (!subject) return res.status(404).json({ error: 'Public course not found' });

      res.json({
        ...subject,
        curriculum: subject.curriculumJson ? JSON.parse(subject.curriculumJson) : null,
        ownerLabel: subject.user.name || subject.user.email.split('@')[0],
      });
    } catch (err) {
      res.status(500).json({ error: 'Preview failed' });
    }
  });

  router.post('/courses/classify-scope', authMiddleware, async (req, res) => {
    const { query } = req.body;
    if (!query?.trim()) return res.status(400).json({ error: 'query is required' });

    try {
      const raw = await callLlm(buildScopeClassifierPrompt(query.trim()), req.body.aiProvider, req.body.aiModel);
      const scope = parseScopeResponse(raw);
      res.json(scope);
    } catch (err) {
      console.error('Scope classify error:', err);
      res.json({ learning_scope: 'quick-lesson', language_code: 'en', reasoning: 'fallback' });
    }
  });

  router.post('/courses/plan', authMiddleware, async (req, res) => {
    const {
      query, learningScope, isPublic, aiProvider, aiModel, promptType,
    } = req.body;
    if (!query?.trim()) return res.status(400).json({ error: 'query is required' });

    const scope = learningScope || 'full-course';
    const searchQuery = normalizeSearchQuery(query);

    try {
      const raw = await callLlm(
        buildCurriculumPrompt(query.trim(), scope),
        aiProvider,
        aiModel
      );
      const curriculum = parseCurriculumResponse(raw);
      const lessons = flattenCurriculumLessons(curriculum);

      if (lessons.length === 0) {
        return res.status(500).json({ error: 'Failed to generate curriculum' });
      }

      const subject = await db.subject.create({
        data: {
          name: curriculum.course_title || query.trim(),
          description: curriculum.description || '',
          searchQuery,
          learningScope: scope,
          isPublic: Boolean(isPublic),
          curriculumJson: JSON.stringify(curriculum),
          userId: req.user.id,
          chapters: {
            create: lessons.map((l) => ({
              name: l.name,
              description: l.description,
              topicQuery: l.topicQuery,
              sortOrder: l.sortOrder,
              generationStatus: 'planned',
            })),
          },
        },
        include: { chapters: { orderBy: { sortOrder: 'asc' } } },
      });

      res.status(201).json({ subject, curriculum });
    } catch (err) {
      console.error('Course plan error:', err);
      res.status(500).json({ error: 'Failed to create course plan' });
    }
  });

  router.post('/courses/:id/use', authMiddleware, async (req, res) => {
    const sourceId = Number(req.params.id);
    try {
      const source = await db.subject.findFirst({
        where: { id: sourceId, isPublic: true },
        include: {
          chapters: {
            orderBy: { sortOrder: 'asc' },
            include: { videos: { orderBy: { createdAt: 'desc' }, take: 1 } },
          },
        },
      });
      if (!source) return res.status(404).json({ error: 'Public course not found' });

      const copy = await db.subject.create({
        data: {
          name: source.name,
          description: source.description,
          searchQuery: source.searchQuery,
          learningScope: source.learningScope,
          isPublic: false,
          curriculumJson: source.curriculumJson,
          sourceSubjectId: source.id,
          userId: req.user.id,
          chapters: {
            create: source.chapters.map((ch) => ({
              name: ch.name,
              description: ch.description,
              topicQuery: ch.topicQuery,
              lessonPlanJson: ch.lessonPlanJson,
              sortOrder: ch.sortOrder,
              generationStatus: ch.videos[0] ? 'completed' : 'planned',
              videos: ch.videos[0] ? {
                create: {
                  title: ch.videos[0].title,
                  text: ch.videos[0].text,
                  audioUrl: ch.videos[0].audioUrl,
                  videoUrl: ch.videos[0].videoUrl,
                  quizzesJson: ch.videos[0].quizzesJson,
                  slidesJson: ch.videos[0].slidesJson,
                },
              } : undefined,
            })),
          },
        },
        include: { chapters: { orderBy: { sortOrder: 'asc' }, include: { videos: true } } },
      });

      res.status(201).json(copy);
    } catch (err) {
      console.error('Use course error:', err);
      res.status(500).json({ error: 'Failed to copy course' });
    }
  });

  router.post('/courses/:id/fork', authMiddleware, async (req, res) => {
    const sourceId = Number(req.params.id);
    try {
      const source = await db.subject.findFirst({
        where: { id: sourceId, isPublic: true },
        include: { chapters: { orderBy: { sortOrder: 'asc' } } },
      });
      if (!source) return res.status(404).json({ error: 'Public course not found' });

      const fork = await db.subject.create({
        data: {
          name: `${source.name} (My copy)`,
          description: source.description,
          searchQuery: normalizeSearchQuery(`${source.name} ${req.user.id}`),
          learningScope: source.learningScope,
          isPublic: false,
          curriculumJson: source.curriculumJson,
          sourceSubjectId: source.id,
          userId: req.user.id,
          chapters: {
            create: source.chapters.map((ch) => ({
              name: ch.name,
              description: ch.description,
              topicQuery: ch.topicQuery,
              lessonPlanJson: ch.lessonPlanJson,
              sortOrder: ch.sortOrder,
              generationStatus: 'planned',
            })),
          },
        },
        include: { chapters: { orderBy: { sortOrder: 'asc' } } },
      });

      res.status(201).json(fork);
    } catch (err) {
      console.error('Fork course error:', err);
      res.status(500).json({ error: 'Failed to fork course' });
    }
  });

  router.get('/courses/mine', authMiddleware, async (req, res) => {
    try {
      const subjects = await db.subject.findMany({
        where: { userId: req.user.id },
        include: {
          chapters: {
            orderBy: { sortOrder: 'asc' },
            include: { videos: { take: 1, orderBy: { createdAt: 'desc' } } },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      const allChapterIds = subjects.flatMap((s) => s.chapters.map((c) => c.id));
      const watchedSet = await getWatchedChapterIds(db, req.user.id, allChapterIds);

      const courses = subjects.map((s) => {
        const pendingChapters = s.chapters.filter((c) => c.videos.length === 0);
        return {
          id: s.id,
          name: s.name,
          description: s.description,
          learningScope: s.learningScope,
          isPublic: s.isPublic,
          updatedAt: s.updatedAt,
          progress: buildCourseProgress(s.chapters, watchedSet),
          pendingCount: pendingChapters.length,
          pendingChapters: pendingChapters.map((c) => ({
            id: c.id,
            name: c.name,
            generationStatus: c.generationStatus,
          })),
        };
      });

      res.json(courses);
    } catch (err) {
      console.error('List courses error:', err);
      res.status(500).json({ error: 'Failed to load courses' });
    }
  });

  router.get('/courses/:id', authMiddleware, async (req, res) => {
    const id = Number(req.params.id);
    try {
      const subject = await db.subject.findFirst({
        where: { id, userId: req.user.id },
        include: {
          chapters: {
            orderBy: { sortOrder: 'asc' },
            include: { videos: { orderBy: { createdAt: 'desc' }, take: 1 } },
          },
        },
      });
      if (!subject) return res.status(404).json({ error: 'Course not found' });

      const chapterIds = subject.chapters.map((c) => c.id);
      const watchedSet = await getWatchedChapterIds(db, req.user.id, chapterIds);
      const chapters = subject.chapters.map((c) => ({
        ...c,
        watched: watchedSet.has(c.id),
        hasVideo: c.videos.length > 0,
      }));

      res.json({
        ...subject,
        chapters,
        curriculum: subject.curriculumJson ? JSON.parse(subject.curriculumJson) : null,
        progress: buildCourseProgress(subject.chapters, watchedSet),
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load course' });
    }
  });

  router.patch('/courses/:id', authMiddleware, async (req, res) => {
    const id = Number(req.params.id);
    const { isPublic, name, description } = req.body;
    try {
      const updated = await db.subject.updateMany({
        where: { id, userId: req.user.id },
        data: {
          ...(typeof isPublic === 'boolean' ? { isPublic } : {}),
          ...(name ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
        },
      });
      if (updated.count === 0) return res.status(404).json({ error: 'Course not found' });
      const subject = await db.subject.findUnique({ where: { id } });
      res.json(subject);
    } catch (err) {
      res.status(500).json({ error: 'Update failed' });
    }
  });

  router.post('/chapters/:chapterId/generate', authMiddleware, async (req, res) => {
    const chapterId = Number(req.params.chapterId);
    const {
      confirmed, regenerate, aiProvider, aiModel, language, promptType, expandedText,
    } = req.body;

    if (!confirmed) {
      return res.status(400).json({ error: 'User confirmation required' });
    }

    try {
      const chapter = await db.chapter.findFirst({
        where: { id: chapterId, subject: { userId: req.user.id } },
        include: { videos: { take: 1 }, subject: true },
      });
      if (!chapter) return res.status(404).json({ error: 'Chapter not found' });

      if (chapter.generationStatus === 'generating') {
        const existing = await db.generationJob.findFirst({
          where: { chapterId, status: { in: ['pending', 'running'] } },
          orderBy: { createdAt: 'desc' },
        });
        if (existing) return res.json({ jobId: existing.id, message: 'Already generating' });
      }

      if (chapter.videos.length > 0 && !regenerate) {
        return res.status(400).json({
          error: 'Video exists. Set regenerate:true after user confirmation.',
          hasVideo: true,
        });
      }

      if (regenerate && chapter.videos.length > 0) {
        await db.video.deleteMany({ where: { chapterId } });
      }

      await db.chapter.update({
        where: { id: chapterId },
        data: { generationStatus: 'generating' },
      });

      const job = await createJob({
        userId: req.user.id,
        chapterId,
        subjectId: chapter.subjectId,
        type: 'lesson-video',
      });

      const topicText = expandedText || chapter.topicQuery || chapter.name;

      startBackgroundJob(job.id, async (onProgress, isCancelled) => {
        onProgress('blueprint', 15);
        const result = await generateVideo({
          text: topicText,
          originalTopic: chapter.topicQuery || chapter.name,
          aiProvider,
          aiModel,
          language,
          promptType: promptType || 'explain-detailed',
          audioDir,
          videoDir,
          callLlm,
          onProgress,
          isCancelled,
        });

        onProgress('saving', 95);
        const video = await db.video.create({
          data: {
            title: chapter.name,
            text: topicText,
            audioUrl: result.audioUrl,
            videoUrl: result.videoUrl,
            quizzesJson: result.quizzesJson,
            slidesJson: result.slidesJson,
            chapterId,
          },
        });

        await db.chapter.update({
          where: { id: chapterId },
          data: { generationStatus: 'completed' },
        });

        return { videoId: video.id, ...result };
      });

      res.status(202).json({ jobId: job.id, message: 'Generation started' });
    } catch (err) {
      console.error('Chapter generate error:', err);
      res.status(500).json({ error: 'Failed to start generation' });
    }
  });

  router.get('/generation-jobs/:id', authMiddleware, async (req, res) => {
    const id = Number(req.params.id);
    try {
      const job = await db.generationJob.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!job) return res.status(404).json({ error: 'Job not found' });
      res.json({
        ...job,
        progressData: job.progress ? JSON.parse(job.progress) : null,
        result: job.resultJson ? JSON.parse(job.resultJson) : null,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch job' });
    }
  });

  router.get('/generation-jobs', authMiddleware, async (req, res) => {
    try {
      const recentCutoff = new Date(Date.now() - 3 * 60 * 1000);
      const jobs = await db.generationJob.findMany({
        where: {
          userId: req.user.id,
          OR: [
            { status: { in: ['pending', 'running'] } },
            { status: { in: ['completed', 'failed'] }, updatedAt: { gte: recentCutoff } },
          ],
        },
        include: {
          chapter: {
            select: {
              id: true,
              name: true,
              subjectId: true,
              subject: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 15,
      });
      res.json(jobs.map((j) => ({
        ...j,
        label: j.chapter?.name || j.chapter?.subject?.name || 'Video',
        chapterId: j.chapterId || j.chapter?.id,
        subjectId: j.subjectId || j.chapter?.subjectId,
        progressData: j.progress ? JSON.parse(j.progress) : null,
      })));
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch jobs' });
    }
  });

  router.delete('/generation-jobs/:id', authMiddleware, async (req, res) => {
    const id = Number(req.params.id);
    try {
      await cancelJob(id, req.user.id);
      res.json({ cancelled: true });
    } catch (err) {
      console.error('Cancel job error:', err);
      res.status(500).json({ error: 'Failed to cancel job' });
    }
  });

  router.post('/courses/quick-lesson', authMiddleware, async (req, res) => {
    const {
      query, expandedText, confirmed, isPublic, aiProvider, aiModel, language, promptType,
    } = req.body;
    if (!confirmed) return res.status(400).json({ error: 'User confirmation required' });
    if (!query?.trim() || !expandedText?.trim()) {
      return res.status(400).json({ error: 'query and expandedText are required' });
    }

    const searchQuery = normalizeSearchQuery(query);
    try {
      const subject = await db.subject.create({
        data: {
          name: query.trim().substring(0, 100),
          searchQuery,
          learningScope: 'quick-lesson',
          isPublic: Boolean(isPublic),
          userId: req.user.id,
          chapters: {
            create: {
              name: query.trim().substring(0, 100),
              topicQuery: query.trim(),
              sortOrder: 0,
              generationStatus: 'generating',
            },
          },
        },
        include: { chapters: true },
      });

      const chapter = subject.chapters[0];
      const job = await createJob({
        userId: req.user.id,
        chapterId: chapter.id,
        subjectId: subject.id,
        type: 'quick-lesson',
      });

      startBackgroundJob(job.id, async (onProgress, isCancelled) => {
        const result = await generateVideo({
          text: expandedText,
          originalTopic: query.trim(),
          aiProvider,
          aiModel,
          language,
          promptType: promptType || 'explain-detailed',
          audioDir,
          videoDir,
          callLlm,
          onProgress,
          isCancelled,
        });

        const video = await db.video.create({
          data: {
            title: query.trim().substring(0, 80),
            text: expandedText,
            audioUrl: result.audioUrl,
            videoUrl: result.videoUrl,
            quizzesJson: result.quizzesJson,
            slidesJson: result.slidesJson,
            chapterId: chapter.id,
          },
        });

        await db.chapter.update({
          where: { id: chapter.id },
          data: { generationStatus: 'completed' },
        });

        return { subjectId: subject.id, chapterId: chapter.id, videoId: video.id, ...result };
      });

      res.status(202).json({
        jobId: job.id,
        subjectId: subject.id,
        chapterId: chapter.id,
      });
    } catch (err) {
      console.error('Quick lesson error:', err);
      res.status(500).json({ error: 'Failed to start quick lesson' });
    }
  });

  router.get('/courses/explore/public', authMiddleware, async (req, res) => {
    try {
      const courses = await db.subject.findMany({
        where: { isPublic: true },
        include: {
          user: { select: { email: true, name: true } },
          chapters: { include: { videos: { take: 1 } } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });
      res.json(courses.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        learningScope: c.learningScope,
        ownerLabel: c.user.name || c.user.email.split('@')[0],
        lessonCount: c.chapters.length,
        completedLessons: c.chapters.filter((ch) => ch.videos.length > 0).length,
      })));
    } catch (err) {
      res.status(500).json({ error: 'Explore failed' });
    }
  });

  return router;
}

module.exports = initCoursesRouter;
