function isRateLimitError(err) {
  const msg = err?.message || String(err);
  return msg.includes('429')
    || msg.includes('rate_limit')
    || msg.includes('Rate limit')
    || msg.includes('tokens per day');
}

function friendlyLlmError(err) {
  const msg = err?.message || String(err);
  if (isRateLimitError(err)) {
    return 'All Groq API keys hit their daily limit. Wait ~2 hours, add more GROQ_API_KEYS, or switch to Gemini in Studio.';
  }
  if (msg.length > 280) return `${msg.slice(0, 280)}…`;
  return msg;
}

function createLlmCaller({
  getNextGroqClient,
  getGroqKeyCount,
  getNextGeminiModel,
  getGeminiKeyCount,
}) {
  async function callGroqOnce(prompt, model, groq) {
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: model || 'llama-3.3-70b-versatile',
      max_tokens: 8000,
    });
    return completion.choices[0]?.message?.content || '{}';
  }

  async function callGroqWithKeyRotation(prompt, model) {
    const keyCount = Math.max(getGroqKeyCount(), 1);
    let lastErr;

    for (let i = 0; i < keyCount; i++) {
      try {
        const groq = getNextGroqClient();
        return await callGroqOnce(prompt, model, groq);
      } catch (err) {
        lastErr = err;
        if (!isRateLimitError(err)) throw err;
        console.warn(`Groq key ${i + 1}/${keyCount} rate-limited — trying next key…`);
      }
    }
    throw lastErr;
  }

  async function callGeminiOnce(prompt, modelName) {
    const currentModel = getNextGeminiModel(modelName || 'gemini-2.5-flash');
    const result = await currentModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8000 },
    });
    return result.response.text();
  }

  async function callGeminiWithKeyRotation(prompt, modelName) {
    const keyCount = getGeminiKeyCount();
    if (keyCount === 0) throw new Error('GEMINI_API_KEY is not set.');

    let lastErr;
    for (let i = 0; i < keyCount; i++) {
      try {
        return await callGeminiOnce(prompt, modelName);
      } catch (err) {
        lastErr = err;
        if (!isRateLimitError(err)) throw err;
        console.warn(`Gemini key ${i + 1}/${keyCount} rate-limited — trying next key…`);
      }
    }
    throw lastErr;
  }

  return async function callLlm(prompt, aiProvider, aiModel) {
    if (aiProvider === 'groq') {
      const primaryModel = aiModel || 'llama-3.3-70b-versatile';
      try {
        return await callGroqWithKeyRotation(prompt, primaryModel);
      } catch (err) {
        if (!isRateLimitError(err)) throw err;

        if (primaryModel !== 'llama-3.1-8b-instant') {
          try {
            console.warn('All Groq keys limited on', primaryModel, '— trying 8b model across keys…');
            return await callGroqWithKeyRotation(prompt, 'llama-3.1-8b-instant');
          } catch (fallbackErr) {
            if (!isRateLimitError(fallbackErr)) throw fallbackErr;
          }
        }

        if (getGeminiKeyCount() > 0) {
          console.warn('All Groq keys exhausted — falling back to Gemini…');
          try {
            return await callGeminiWithKeyRotation(prompt, 'gemini-2.5-flash');
          } catch (geminiErr) {
            throw new Error(friendlyLlmError(geminiErr));
          }
        }
        throw new Error(friendlyLlmError(err));
      }
    }

    return callGeminiWithKeyRotation(prompt, aiModel || 'gemini-2.5-flash');
  };
}

module.exports = { createLlmCaller, friendlyLlmError, isRateLimitError };
