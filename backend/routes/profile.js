const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/index');
const authMiddleware = require('../middleware/auth');
const { buildCourseProgress } = require('../lib/progressUtils');

const router = express.Router();

router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const [
      user,
      ownedSubjects,
      courses,
      recentVideos,
      activeJobs,
      watchedProgress,
      publicCourses,
      historyCount,
    ] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, createdAt: true },
      }),
      db.subject.findMany({
        where: { userId },
        select: { id: true },
      }),
      db.subject.findMany({
        where: { userId },
        include: {
          chapters: { include: { videos: { take: 1, orderBy: { createdAt: 'desc' } } } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      }),
      db.video.findMany({
        where: { chapter: { subject: { userId } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          createdAt: true,
          chapter: { select: { name: true, subject: { select: { id: true, name: true } } } },
        },
      }),
      db.generationJob.findMany({
        where: { userId, status: { in: ['pending', 'running'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      db.lessonProgress.findMany({
        where: { userId, completed: true },
        select: { chapterId: true },
      }),
      db.subject.count({ where: { userId, isPublic: true } }),
      db.history.count({ where: { userId } }),
    ]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const ownedIds = ownedSubjects.map((s) => s.id);
    let courseAdopters = 0;
    let chapterCount = 0;
    let videoCount = 0;

    if (ownedIds.length > 0) {
      [courseAdopters, chapterCount, videoCount] = await Promise.all([
        db.subject.count({ where: { sourceSubjectId: { in: ownedIds } } }),
        db.chapter.count({ where: { subjectId: { in: ownedIds } } }),
        db.video.count({ where: { chapter: { subjectId: { in: ownedIds } } } }),
      ]);
    }

    const watchedSet = new Set(watchedProgress.map((w) => w.chapterId));

    const courseProgress = courses.map((c) => ({
      id: c.id,
      name: c.name,
      learningScope: c.learningScope,
      isPublic: c.isPublic,
      progress: buildCourseProgress(c.chapters, watchedSet),
    }));

    res.json({
      user,
      stats: {
        subjects: ownedSubjects.length,
        chapters: chapterCount,
        videos: videoCount,
        historyItems: historyCount,
        publicCourses,
        courseAdopters,
        lessonsWatched: watchedSet.size,
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
