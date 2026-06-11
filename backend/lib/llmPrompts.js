const NATIVE_SCRIPT_RULES = {
  te: 'Write ALL text strictly in native Telugu script (తెలుగు). Absolutely NO English transliteration or Roman letters.',
  hi: 'Write ALL text strictly in native Devanagari script (हिन्दी). Absolutely NO English transliteration or Roman letters.',
  es: 'Write ALL text strictly in Spanish.',
  fr: 'Write ALL text strictly in French.',
  de: 'Write ALL text strictly in German.',
  en: 'Write ALL text in English.',
};

const NARRATION_LENGTH_RANGES = {
  short: { min: 60, max: 100 },
  medium: { min: 130, max: 180 },
  long: { min: 200, max: 260 },
};

const MODE_LABELS = {
  'explain-detailed': 'Detailed Explanation',
  'explain-simple': 'Simple Explanation (ELI5)',
  summarize: 'Summary',
};

function getLanguageInstruction(language) {
  const code = (language || 'en').toLowerCase().split('-')[0];
  return NATIVE_SCRIPT_RULES[code]
    || `Write ALL text strictly in the language code "${language}". Use the native script only — never transliteration.`;
}

function getNarrationWordRange(narrationLength, mode) {
  const tier = NARRATION_LENGTH_RANGES[narrationLength] || NARRATION_LENGTH_RANGES.medium;

  if (mode === 'summarize') {
    return NARRATION_LENGTH_RANGES.short;
  }

  if (mode === 'explain-simple') {
    return {
      min: Math.round(tier.min * 0.7),
      max: Math.round(tier.max * 0.7),
    };
  }

  return tier;
}

function parseJsonObject(rawText, contextLabel) {
  let cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    cleaned = cleaned.slice(start, end + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse ${contextLabel}: ${err.message}`);
  }
}

function parseBlueprintResponse(rawText) {
  return parseJsonObject(rawText, 'content blueprint');
}

function parseSlideGenerationResponse(rawText) {
  let cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    cleaned = cleaned.slice(start, end + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // JSON was truncated — recover last complete slide
    const slidesStart = cleaned.indexOf('"slides"');
    if (slidesStart === -1) throw new Error('No slides key found in response');

    const arrStart = cleaned.indexOf('[', slidesStart);
    if (arrStart === -1) throw new Error('No slides array found');

    let i = cleaned.length - 1;
    while (i > arrStart && cleaned[i] !== '}') i--;

    if (i <= arrStart) throw new Error('No complete slide found in truncated response');

    const recovered = `${cleaned.slice(0, i + 1)}],"interactive_quizzes":[]}`;
    return JSON.parse(recovered);
  }
}

function buildIntentClassifierPrompt(userQuery) {
  return `You are an expert educational content strategist. Before writing any slides, deeply reason about the user's query and produce a complete content blueprint.

Think through these questions internally before producing output:
- What is the user actually asking for? (solution? explanation? overview? answer?)
- What kind of content does this topic naturally decompose into?
- How many slides does this genuinely need — not too few, not padded?
- Does visual imagery actually help this content, or is it a distraction?
- How long should each narration be — a 3-step how-to needs less than a broad survey?
- What logical arc should the slides follow for maximum understanding?

Return ONLY a valid JSON object (no markdown, no code fences, no commentary) with this exact structure:

{
  "intent": "short plain-English label describing what this query asks for — freeform, not an enum",
  "language_code": "detected language of the user query, e.g. te, hi, en",
  "slide_plan": [
    {
      "slide_number": 1,
      "title": "what this slide covers",
      "purpose": "one sentence: why this slide exists in the arc",
      "narration_length": "short | medium | long",
      "needs_image": false,
      "image_search_keyword": "",
      "layout_type": "full-text",
      "display_style": "bullets"
    }
  ],
  "quiz_plan": [
    {
      "pause_after_slide": 1,
      "question_hint": "one sentence describing what concept to quiz here"
    }
  ],
  "narration_tone": "freeform global tone, e.g. rigorous professor, encouraging coding coach"
}

FIELD RULES:

narration_length tiers:
- "short"  = 60-100 words  (simple facts, transitions, summaries)
- "medium" = 130-180 words (standard concept explanation)
- "long"   = 200-260 words (complex ideas, worked examples, deep dives)

needs_image:
- true ONLY if a real photograph or illustration meaningfully aids understanding of THAT slide.
- false for: code, math, algorithms, dry runs, syntax, logic problems, proofs, any slide where text is the content.
- true for: real-world objects, places, people, natural phenomena, UI concepts, physical processes.

image_search_keyword:
- ALWAYS in English. Specific 3-6 word Pexels search phrase.
- Empty string "" if needs_image is false.
- Never translate this field.

layout_type:
- one of: "text-left-image-right", "text-right-image-left", "split-card", "centered-hero", "full-text"
- must be "full-text" or "split-card" if needs_image is false.

display_style:
- one of: "bullets", "code-block", "item-card", "numbered-steps", "key-value"

quiz_plan:
- place quizzes at genuine comprehension checkpoints, not uniformly spaced.
- let slide count and natural pause points determine quiz count.
- never place a quiz after the intro slide (index 0) or the final summary slide.

slide_plan:
- choose the slide count that genuinely fits the topic — do not pad, do not under-cover.
- slide_number starts at 1.

User Query:
${userQuery}`;
}

function buildDisplayStyleRules() {
  return `DISPLAY TEXT RULES (apply display_style from the plan per slide):
- "bullets"          → 4-6 complete-sentence bullets (never single words). Title on first line, then bullets.
- "code-block"       → display_text is primarily code or pseudocode with minimal prose. Use \\n for lines.
- "item-card"        → title = item name on first line; body = definition + example + significance.
- "numbered-steps"   → numbered list; each step is an actionable complete sentence.
- "key-value"        → "Term: explanation" format per line.`;
}

function buildDynamicSlidePrompt(blueprint, userQuery, mode = 'explain-detailed') {
  const languageCode = blueprint.language_code || 'en';
  const languageInstruction = getLanguageInstruction(languageCode);
  const modeLabel = MODE_LABELS[mode] || MODE_LABELS['explain-detailed'];

  const slidePlanDetails = (blueprint.slide_plan || []).map((slide) => {
    const range = getNarrationWordRange(slide.narration_length, mode);
    return `Slide ${slide.slide_number}:
  - title: ${slide.title}
  - purpose: ${slide.purpose}
  - narration_length: ${slide.narration_length} → write ${range.min}-${range.max} words
  - display_style: ${slide.display_style}
  - layout_type: ${slide.layout_type} (DO NOT change)
  - needs_image: ${slide.needs_image} (DO NOT change)
  - image_search_keyword: "${slide.image_search_keyword || ''}" (copy exactly; English only)`;
  }).join('\n\n');

  const quizPlanDetails = (blueprint.quiz_plan || []).length > 0
    ? JSON.stringify(blueprint.quiz_plan, null, 2)
    : '[]';

  const modeNarrationRules = {
    'explain-detailed': 'Use the full word-count range for each slide\'s narration_length tier.',
    'explain-simple': 'Reduce narration by ~30% vs the tier ranges above. Use simpler vocabulary and more analogies.',
    summarize: 'Use the SHORT tier word count (60-100 words) for EVERY slide regardless of blueprint narration_length.',
  };

  return `You are an expert slide writer executing a pre-approved content plan. Do NOT deviate from the blueprint.

CONTENT INTENT: ${blueprint.intent || 'educational explanation'}
GLOBAL NARRATION TONE: ${blueprint.narration_tone || 'clear educational narrator'}
MODE: ${modeLabel}
${languageInstruction}

You must produce EXACTLY ${(blueprint.slide_plan || []).length} slides in the same order as the plan.
Do NOT add, remove, reorder, or merge slides.
For each slide, honor layout_type, needs_image, and display_style from the plan.

═══════════════════════════════════════
APPROVED SLIDE PLAN
═══════════════════════════════════════
${slidePlanDetails}

═══════════════════════════════════════
QUIZ PLAN
═══════════════════════════════════════
${quizPlanDetails}

NARRATION RULES:
- ${modeNarrationRules[mode] || modeNarrationRules['explain-detailed']}
- Apply tone "${blueprint.narration_tone}" consistently across all narration_text fields.
- narration_text must expand beyond display_text — do not simply read the slide verbatim.
- Add intuition, examples, and bridges between slides where appropriate.

${buildDisplayStyleRules()}

IMAGE RULES:
- image_search_keyword: copy from blueprint per slide. ALWAYS English. Empty string "" when needs_image is false.
- Never translate image_search_keyword.

SLIDE VISUAL RULES:
- slide_bg_color: hex color forming a cohesive theme across slides (vary slightly per slide).
- layout_type: must match blueprint exactly for each slide.

QUIZ RULES:
- Generate interactive_quizzes from quiz_plan.
- pause_after_slide is 0-based index (slide 1 = index 0).
- Each quiz: question, 4 options, correct_answer as 0-based index.
- Questions and options follow the language instruction above.

Return ONLY a valid JSON object (no markdown, no code fences, no commentary):

{
  "slides": [
    {
      "narration_text": "...",
      "display_text": "...",
      "slide_bg_color": "#1e3a5f",
      "layout_type": "text-left-image-right",
      "image_search_keyword": "english pexels phrase or empty string"
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

Escape all special JSON characters properly. Use \\n for line breaks in display_text.

User Query (for context):
${userQuery}`;
}

function buildScopeClassifierPrompt(userQuery) {
  return `You are an educational content strategist. Classify the user's learning goal.

Return ONLY valid JSON (no markdown):
{
  "learning_scope": "quick-lesson | deep-dive | full-course",
  "reasoning": "one sentence why",
  "language_code": "detected language e.g. en, te, hi"
}

Rules:
- "quick-lesson": single narrow concept answerable in one 5-12 minute video (e.g. "segment trees", "what is a pointer")
- "deep-dive": one subtopic needing thorough coverage in one lesson (e.g. "pointers in C", "dynamic programming intro")
- "full-course": broad mastery goal needing many separate lessons (e.g. "learn C", "Python for beginners", "class 12 physics")

User Query:
${userQuery}`;
}

function buildCurriculumPrompt(userQuery, learningScope = 'full-course') {
  return `You are a curriculum architect designing a structured learning path.

The user wants a ${learningScope === 'deep-dive' ? 'thorough deep-dive module' : 'complete multi-lesson course'} on:
${userQuery}

Return ONLY valid JSON (no markdown):
{
  "course_title": "clear course title",
  "description": "2-3 sentence course overview",
  "language_code": "detected language",
  "modules": [
    {
      "order": 1,
      "module_title": "module name",
      "module_description": "what this module covers",
      "lessons": [
        {
          "order": 1,
          "title": "lesson title",
          "topic_query": "specific query for this lesson's video generation",
          "description": "one sentence what student learns"
        }
      ]
    }
  ]
}

Rules:
- ${learningScope === 'full-course' ? '8-16 lessons total across 4-8 modules. Cover ALL major subtopics — do not skip fundamentals.' : '3-6 lessons in 2-3 modules for a deep-dive.'}
- Each lesson = one generate-able video. Keep topic_query specific and narrow.
- Logical prerequisite order.
- Do NOT combine unrelated topics into one lesson.

User Query:
${userQuery}`;
}

function parseCurriculumResponse(rawText) {
  return parseJsonObject(rawText, 'curriculum');
}

function parseScopeResponse(rawText) {
  return parseJsonObject(rawText, 'scope classification');
}

module.exports = {
  buildIntentClassifierPrompt,
  buildDynamicSlidePrompt,
  buildScopeClassifierPrompt,
  buildCurriculumPrompt,
  parseBlueprintResponse,
  parseSlideGenerationResponse,
  parseCurriculumResponse,
  parseScopeResponse,
  getLanguageInstruction,
};
