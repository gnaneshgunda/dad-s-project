const express = require('express');
const db = require('../db/index');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.post('/progress/chapters/:chapterId/complete', authMiddleware, async (req, res) => {
  const chapterId = Number(req.params.chapterId);
  try {
    const chapter = await db.chapter.findFirst({
      where: { id: chapterId, subject: { userId: req.user.id } },
      include: { videos: { take: 1 } },
    });
    if (!chapter) return res.status(404).json({ error: 'Lesson not found' });
    if (chapter.videos.length === 0) {
      return res.status(400).json({ error: 'No video to mark as watched' });
    }

    const progress = await db.lessonProgress.upsert({
      where: { userId_chapterId: { userId: req.user.id, chapterId } },
      create: {
        userId: req.user.id,
        chapterId,
        completed: true,
        completedAt: new Date(),
      },
      update: {
        completed: true,
        completedAt: new Date(),
      },
    });

    res.json(progress);
  } catch (err) {
    console.error('Mark complete error:', err);
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

module.exports = router;
