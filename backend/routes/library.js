const express = require('express');
const db = require('../db/index');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.get('/library', authMiddleware, async (req, res) => {
  try {
    const subjects = await db.subject.findMany({
      where: { userId: req.user.id },
      include: {
        chapters: {
          include: {
            videos: {
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(subjects);
  } catch (err) {
    console.error('Error fetching library:', err);
    res.status(500).json({ error: 'Failed to fetch library' });
  }
});

router.get('/subjects', authMiddleware, async (req, res) => {
  try {
    const subjects = await db.subject.findMany({
      where: { userId: req.user.id },
      include: { _count: { select: { chapters: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(subjects);
  } catch (err) {
    console.error('Error fetching subjects:', err);
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
});

router.post('/subjects', authMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ error: 'Subject name is required' });
  }

  try {
    const subject = await db.subject.create({
      data: { name: name.trim(), userId: req.user.id },
    });
    res.status(201).json(subject);
  } catch (err) {
    console.error('Error creating subject:', err);
    res.status(500).json({ error: 'Failed to create subject' });
  }
});

router.delete('/subjects/:id', authMiddleware, async (req, res) => {
  const subjectId = Number(req.params.id);
  try {
    const deleted = await db.subject.deleteMany({
      where: { id: subjectId, userId: req.user.id },
    });
    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }
    res.json({ message: 'Subject deleted' });
  } catch (err) {
    console.error('Error deleting subject:', err);
    res.status(500).json({ error: 'Failed to delete subject' });
  }
});

router.get('/subjects/:subjectId/chapters', authMiddleware, async (req, res) => {
  const subjectId = Number(req.params.subjectId);
  try {
    const subject = await db.subject.findFirst({
      where: { id: subjectId, userId: req.user.id },
    });
    if (!subject) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    const chapters = await db.chapter.findMany({
      where: { subjectId },
      include: { _count: { select: { videos: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(chapters);
  } catch (err) {
    console.error('Error fetching chapters:', err);
    res.status(500).json({ error: 'Failed to fetch chapters' });
  }
});

router.post('/subjects/:subjectId/chapters', authMiddleware, async (req, res) => {
  const subjectId = Number(req.params.subjectId);
  const { name } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: 'Chapter name is required' });
  }

  try {
    const subject = await db.subject.findFirst({
      where: { id: subjectId, userId: req.user.id },
    });
    if (!subject) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    const chapter = await db.chapter.create({
      data: { name: name.trim(), subjectId },
    });
    res.status(201).json(chapter);
  } catch (err) {
    console.error('Error creating chapter:', err);
    res.status(500).json({ error: 'Failed to create chapter' });
  }
});

router.delete('/chapters/:id', authMiddleware, async (req, res) => {
  const chapterId = Number(req.params.id);
  try {
    const chapter = await db.chapter.findFirst({
      where: { id: chapterId, subject: { userId: req.user.id } },
    });
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    await db.chapter.delete({ where: { id: chapterId } });
    res.json({ message: 'Chapter deleted' });
  } catch (err) {
    console.error('Error deleting chapter:', err);
    res.status(500).json({ error: 'Failed to delete chapter' });
  }
});

router.get('/chapters/:chapterId/videos', authMiddleware, async (req, res) => {
  const chapterId = Number(req.params.chapterId);
  try {
    const chapter = await db.chapter.findFirst({
      where: { id: chapterId, subject: { userId: req.user.id } },
    });
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    const videos = await db.video.findMany({
      where: { chapterId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(videos);
  } catch (err) {
    console.error('Error fetching videos:', err);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

router.get('/videos/:id', authMiddleware, async (req, res) => {
  const videoId = Number(req.params.id);
  try {
    const video = await db.video.findFirst({
      where: {
        id: videoId,
        chapter: { subject: { userId: req.user.id } },
      },
      include: {
        chapter: {
          include: { subject: true },
        },
      },
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    res.json({
      ...video,
      interactiveQuizzes: video.quizzesJson ? JSON.parse(video.quizzesJson) : [],
    });
  } catch (err) {
    console.error('Error fetching video:', err);
    res.status(500).json({ error: 'Failed to fetch video' });
  }
});

module.exports = router;
