const NATIVE_SCRIPT_RULES = {
  te: 'Write ALL text strictly in native Telugu script (తెలుగు). Absolutely NO English transliteration or Roman letters.',
  hi: 'Write ALL text strictly in native Devanagari script (हिन्दी). Absolutely NO English transliteration or Roman letters.',
  es: 'Write ALL text strictly in Spanish.',
  fr: 'Write ALL text strictly in French.',
  de: 'Write ALL text strictly in German.',
  en: 'Write ALL text in English.',
};

function getLanguageInstruction(language) {
  const code = (language || 'en').toLowerCase().split('-')[0];
  return NATIVE_SCRIPT_RULES[code] || `Write ALL text strictly in the language code "${language}". Use the native script only — never transliteration.`;
}

// Detect if the topic is broad/complex (e.g. "Learn C", "Python tutorial", "Calculus")
// vs narrow/specific (e.g. "What is a pointer", "Explain photosynthesis")
function estimateTopicComplexity(text) {
  const broadKeywords = [
    'learn', 'tutorial', 'course', 'complete', 'full', 'introduction to',
    'intro to', 'basics of', 'fundamentals', 'programming', 'language',
    'from scratch', 'beginner', 'guide to', 'overview of', 'all about',
  ];
  const lower = text.toLowerCase();
  const isBroad = broadKeywords.some(kw => lower.includes(kw)) || lower.split(' ').length <= 4;
  return isBroad ? 'broad' : 'narrow';
}

const MODE_CONFIGS = {
  'explain-detailed': {
    label: 'Detailed Explanation',
    slideCount: { broad: '15-20', narrow: '8-12' },
    narrationWords: '180-250',
    displayWords: '80-120',
    narrationInstruction: `Write a deeply detailed professor-style lecture segment. Open with motivation and real-world relevance. Unpack every concept thoroughly with analogies, concrete examples, and step-by-step reasoning. For programming/math topics, walk through syntax and worked examples in the narration. Anticipate confusion and address it. Bridge into the next slide at the end. This is the most important field — treat it as a standalone lecture segment a student could learn from without any other resource.`,
    displayInstruction: `Write detailed slide content. Each bullet must be a complete thought with a mini-explanation (1-2 sentences). For code/syntax topics, include actual syntax examples or pseudo-code in the display text. Title on first line, then well-developed points. Never use single-word bullets.`,
    flowInstruction: `For broad topics (e.g. "Learn C"): dedicate 2-3 slides per major subtopic (e.g. Variables, Loops, Functions, Pointers each get their own deep-dive slides). Cover syntax, examples, common mistakes, and best practices. Do NOT give a 1-slide overview of everything — that teaches nothing. For narrow topics: go deep on every angle of that single concept.`,
  },
  'explain-simple': {
    label: 'Simple (ELI5)',
    slideCount: { broad: '8-12', narrow: '6-8' },
    narrationWords: '100-150',
    displayWords: '40-70',
    narrationInstruction: `Explain like you're talking to a curious 12-year-old. Use everyday analogies, simple language, and relatable examples. Avoid jargon — if you must use a technical term, immediately explain it in plain words. Keep it warm, encouraging, and fun. One key idea per slide.`,
    displayInstruction: `Simple, clear slide text. Short sentences. Avoid technical jargon. Use friendly language and relatable comparisons. Title on first line, then 3-5 easy-to-read points.`,
    flowInstruction: `Build concepts from the most basic foundation upward. Each slide should feel like a natural "aha" moment. Use stories or everyday scenarios to explain abstract ideas. End with a fun real-world application.`,
  },
  'summarize': {
    label: 'Summary',
    slideCount: { broad: '6-8', narrow: '4-6' },
    narrationWords: '60-90',
    displayWords: '30-50',
    narrationInstruction: `Give a crisp, efficient summary. State the key point of this slide, explain why it matters in 1-2 sentences, and move on. No deep dives — this is a review tool for someone who already knows the topic.`,
    displayInstruction: `Tight, scannable slide content. Bullet points should be concise key facts or takeaways (1 sentence max each). Title on first line. Prioritize the most important information only.`,
    flowInstruction: `Cover the essential concepts and nothing else. Each slide = one major idea summarized. End with a "Key Takeaways" slide listing the 5-7 most important points from the entire topic.`,
  },
};

function buildSlideGenerationPrompt(text, language, mode = 'explain-detailed', originalTopic = '') {
  const languageInstruction = getLanguageInstruction(language);
  const topicForComplexity = originalTopic.trim() || text;
  const complexity = estimateTopicComplexity(topicForComplexity);
  const cfg = MODE_CONFIGS[mode] || MODE_CONFIGS['explain-detailed'];
  const slideCount = cfg.slideCount[complexity];

  return `You are a world-class professor and educational content designer creating a lecture video in "${cfg.label}" style.
${languageInstruction}

Return ONLY a valid JSON object (no markdown, no code fences, no commentary) with this exact structure:
{
  "slides": [
    {
      "narration_text": "...",
      "display_text": "...",
      "slide_bg_color": "#1e3a5f",
      "layout_type": "text-left-image-right",
      "image_search_keyword": "..."
    }
  ],
  "interactive_quizzes": [
    {
      "pause_after_slide": 1,
      "question": "...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": 0
    }
  ]
}

═══════════════════════════════════════
MODE: ${cfg.label.toUpperCase()}
═══════════════════════════════════════

SLIDE COUNT:
- Generate exactly ${slideCount} slides. This topic is "${complexity === 'broad' ? 'broad/complex' : 'narrow/specific'}" so ${complexity === 'broad' ? 'cover all major subtopics with dedicated slides' : 'go deep on the specific concept'}.
- Never generate fewer than ${slideCount.split('-')[0]} slides. Fewer slides = less learning.

NARRATION TEXT (${cfg.narrationWords} words per slide):
${cfg.narrationInstruction}

DISPLAY TEXT (${cfg.displayWords} words per slide):
${cfg.displayInstruction}

CONTENT FLOW:
${cfg.flowInstruction}

GENERAL RULES:
- "slide_bg_color": hex color with a cohesive visual theme. Vary slightly per slide.
- "layout_type": one of "text-left-image-right", "text-right-image-left", "split-card", "centered-hero", "full-text".
- "image_search_keyword": ALWAYS in ENGLISH regardless of target language. Specific Pexels stock photo search phrase, 3-6 words (e.g. "C programming code terminal", "binary tree data structure diagram"). Never translate this field.
- "interactive_quizzes": generate ${mode === 'summarize' ? '2' : '3-4'} quizzes placed at logical checkpoints (not all at the end). Write questions and options in the target language. "correct_answer" is the 0-based index into "options".
- Escape all special JSON characters properly.
- Use \\n for line breaks in display_text.

User Topic:
${text}

${originalTopic && originalTopic !== text ? `Supporting Reference (pre-expanded content — use for depth but do NOT limit yourself to it):
${originalTopic}` : ''}`;
}

function parseSlideGenerationResponse(rawText) {
  let cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    cleaned = cleaned.slice(start, end + 1);
  }
  return JSON.parse(cleaned);
}

module.exports = {
  buildSlideGenerationPrompt,
  parseSlideGenerationResponse,
  getLanguageInstruction,
};