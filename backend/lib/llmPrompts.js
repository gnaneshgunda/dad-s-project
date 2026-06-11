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

function buildSlideGenerationPrompt(text, language) {
  const languageInstruction = getLanguageInstruction(language);

  return `You are a world-class professor and educational content designer creating a rich, detailed lecture video.

${languageInstruction}

Return ONLY a valid JSON object (no markdown, no code fences, no commentary) with this exact structure:

{
  "slides": [
    {
      "narration_text": "Spoken lecture narration in the target language — long, detailed, engaging",
      "display_text": "Slide title\\n\\n• Key point one\\n• Key point two",
      "slide_bg_color": "#1e3a5f",
      "layout_type": "text-left-image-right",
      "image_search_keyword": "highly descriptive English stock photo search phrase, 3-6 words"
    }
  ],
  "interactive_quizzes": [
    {
      "pause_after_slide": 1,
      "question": "Quiz question in the target language",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": 0
    }
  ]
}

RULES:
- "slides": array of 6-10 slides that teach the topic progressively from introduction to advanced details. Never fewer than 6.
- "narration_text": long professor-style spoken explanation (aim for 80-120 words per slide). Introduce the concept, explain it deeply with analogies or real-world examples, and connect it to the broader topic. Do NOT simply read display_text verbatim. This is the most important field — make it rich and educational.
- "display_text": concise slide content with clear hierarchy (title on first line, then bullets or short paragraphs). Use \\n for line breaks.
- "slide_bg_color": hex color forming a cohesive visual theme across slides (vary slightly per slide).
- "layout_type": one of "text-left-image-right", "text-right-image-left", "split-card", "centered-hero", "full-text".
- "image_search_keyword": ALWAYS write this in ENGLISH regardless of the target language. Use a specific, visual, searchable phrase for Pexels stock photo search (e.g. "solar system planets orbit diagram", "human brain neuron network"). Never translate this field.
- "interactive_quizzes": 2-3 quizzes testing key concepts. Use "pause_after_slide" (0-based index of the slide AFTER which to pause). "correct_answer" is the 0-based index into "options". Write questions and options in the target language.
- Maintain logical flow: start with context/motivation, build up concepts, end with summary or implications.
- Escape special JSON characters properly.

User Topic/Text:
${text}`;}


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
