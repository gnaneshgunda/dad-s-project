const VOICES = [
  { id: 'en-US-AriaNeural', label: 'English (US) — Aria', language: 'en' },
  { id: 'en-US-GuyNeural', label: 'English (US) — Guy', language: 'en' },
  { id: 'en-GB-SoniaNeural', label: 'English (UK) — Sonia', language: 'en' },
  { id: 'en-GB-RyanNeural', label: 'English (UK) — Ryan', language: 'en' },
  { id: 'te-IN-ShrutiNeural', label: 'Telugu (IN) — Shruti', language: 'te' },
  { id: 'te-IN-MohanNeural', label: 'Telugu (IN) — Mohan', language: 'te' },
  { id: 'hi-IN-SwaraNeural', label: 'Hindi (IN) — Swara', language: 'hi' },
  { id: 'hi-IN-MadhurNeural', label: 'Hindi (IN) — Madhur', language: 'hi' },
  { id: 'es-ES-ElviraNeural', label: 'Spanish (ES) — Elvira', language: 'es' },
  { id: 'es-MX-DaliaNeural', label: 'Spanish (MX) — Dalia', language: 'es' },
  { id: 'fr-FR-DeniseNeural', label: 'French (FR) — Denise', language: 'fr' },
  { id: 'de-DE-KatjaNeural', label: 'German (DE) — Katja', language: 'de' },
];

const voiceMap = Object.fromEntries(
  VOICES.flatMap((voice) => [
    [voice.language, voice.id],
    [voice.id.toLowerCase(), voice.id],
  ])
);

const defaultVoice = 'en-US-AriaNeural';

function resolveEdgeVoice(languageOrVoice) {
  if (!languageOrVoice) return defaultVoice;
  const normalized = languageOrVoice.trim();
  const lower = normalized.toLowerCase();

  if (voiceMap[lower]) {
    return voiceMap[lower];
  }

  if (/^[a-z]{2}(-[A-Z][a-z]+){2,}$/.test(normalized) || /^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/.test(normalized)) {
    return normalized;
  }

  return defaultVoice;
}

module.exports = {
  VOICES,
  defaultVoice,
  resolveEdgeVoice,
};
