const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/index');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await db.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [subjectCount, chapterCount, videoCount, historyCount] = await Promise.all([
      db.subject.count({ where: { userId: req.user.id } }),
      db.chapter.count({ where: { subject: { userId: req.user.id } } }),
      db.video.count({ where: { chapter: { subject: { userId: req.user.id } } } }),
      db.history.count({ where: { userId: req.user.id } }),
    ]);

    const [recentVideos, courses, publicCourses, activeJobs] = await Promise.all([
      db.video.findMany({
        where: { chapter: { subject: { userId: req.user.id } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          createdAt: true,
          chapter: { select: { name: true, subject: { select: { id: true, name: true } } } },
        },
      }),
      db.subject.findMany({
        where: { userId: req.user.id },
        include: {
          chapters: { include: { videos: { take: 1 } } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      }),
      db.subject.count({ where: { userId: req.user.id, isPublic: true } }),
      db.generationJob.findMany({
        where: { userId: req.user.id, status: { in: ['pending', 'running'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const courseProgress = courses.map((c) => {
      const total = c.chapters.length;
      const completed = c.chapters.filter((ch) => ch.videos.length > 0).length;
      return {
        id: c.id,
        name: c.name,
        learningScope: c.learningScope,
        isPublic: c.isPublic,
        total,
        completed,
        percent: total ? Math.round((completed / total) * 100) : 0,
      };
    });

    res.json({
      user,
      stats: {
        subjects: subjectCount,
        chapters: chapterCount,
        videos: videoCount,
        historyItems: historyCount,
        publicCourses,
      },
      recentVideos,
      courseProgress,
      activeJobs,
    });
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.put('/profile', authMiddleware, async (req, res) => {
  const { name } = req.body;

  try {
    const user = await db.user.update({
      where: { id: req.user.id },
      data: { name: name?.trim() || null },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    res.json(user);
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.put('/profile/password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  try {
    const user = await db.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword },
    });

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Error updating password:', err);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

module.exports = router;
