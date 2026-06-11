function createLlmCaller(getNextGroqClient, getNextGeminiModel) {
  return async function callLlm(prompt, aiProvider, aiModel) {
    if (aiProvider === 'groq') {
      const groq = getNextGroqClient();
      const model = aiModel || 'llama-3.3-70b-versatile';
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model,
        max_tokens: 8000,
      });
      return completion.choices[0]?.message?.content || '{}';
    }

    const modelName = aiModel || 'gemini-2.5-flash';
    const currentModel = getNextGeminiModel(modelName);
    const result = await currentModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8000 },
    });
    return result.response.text();
  };
}

module.exports = { createLlmCaller };
