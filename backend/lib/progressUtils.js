async function getWatchedChapterIds(db, userId, chapterIds) {
  if (!chapterIds.length) return new Set();
  const rows = await db.lessonProgress.findMany({
    where: { userId, chapterId: { in: chapterIds }, completed: true },
    select: { chapterId: true },
  });
  return new Set(rows.map((r) => r.chapterId));
}

function buildCourseProgress(chapters, watchedSet) {
  const total = chapters.length;
  const generated = chapters.filter((c) => (c.videos?.length ?? 0) > 0).length;
  const watched = chapters.filter((c) => watchedSet.has(c.id)).length;
  return {
    total,
    generated,
    generatedPercent: total ? Math.round((generated / total) * 100) : 0,
    watched,
    watchedPercent: total ? Math.round((watched / total) * 100) : 0,
  };
}

module.exports = { getWatchedChapterIds, buildCourseProgress };
