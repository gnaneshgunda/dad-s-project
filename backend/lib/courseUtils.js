function normalizeSearchQuery(query) {
  return (query || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function flattenCurriculumLessons(curriculum) {
  const lessons = [];
  let sortOrder = 0;
  for (const mod of curriculum.modules || []) {
    for (const lesson of mod.lessons || []) {
      lessons.push({
        sortOrder: sortOrder++,
        name: lesson.title,
        description: lesson.description || mod.module_description || '',
        topicQuery: lesson.topic_query || lesson.title,
        moduleTitle: mod.module_title,
      });
    }
  }
  return lessons;
}

module.exports = {
  normalizeSearchQuery,
  flattenCurriculumLessons,
};
