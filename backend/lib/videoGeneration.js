const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');
const { buildSlideGenerationPrompt, parseSlideGenerationResponse } = require('./llmPrompts');
const { resolveSlideImage } = require('./stockPhotos');
const { renderSlide } = require('./slideRenderer');
const { resolveEdgeVoice } = require('./voices');

async function generateAudioFile(text, voice, filepath) {
  await new Promise((resolve, reject) => {
    const child = spawn('node', ['generateAudioChild.js', text, voice, filepath], {
      cwd: path.join(__dirname, '..'),
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('Audio generation failed'));
    });
    child.on('error', reject);
  });
}

function getAudioDuration(filepath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filepath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration);
    });
  });
}

function buildQuizTimestamps(rawQuizzes, slideEndTimes) {
  if (!Array.isArray(rawQuizzes)) return [];

  return rawQuizzes
    .map((quiz) => {
      let timestamp = quiz.timestamp_seconds;

      if (typeof quiz.pause_after_slide === 'number') {
        const idx = quiz.pause_after_slide;
        if (idx >= 0 && idx < slideEndTimes.length) {
          timestamp = slideEndTimes[idx];
        }
      }

      if (timestamp == null) return null;

      return {
        timestamp_seconds: Number(timestamp),
        question: quiz.question,
        options: quiz.options || [],
        correct_index: quiz.correct_answer ?? quiz.correct_index ?? 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);
}

async function callLlm(prompt, aiProvider, aiModel, getNextGroqClient, getNextGeminiModel) {
  if (aiProvider === 'groq') {
    const groq = getNextGroqClient();
    const model = aiModel || 'llama-3.3-70b-versatile';
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model,
    });
    return completion.choices[0]?.message?.content || '{}';
  }

  const modelName = aiModel || 'gemini-2.5-flash';
  const currentModel = getNextGeminiModel(modelName);
  const result = await currentModel.generateContent(prompt);
  return result.response.text();
}

async function generateVideo({
  text,
  aiProvider,
  aiModel,
  language,
  audioDir,
  videoDir,
  getNextGroqClient,
  getNextGeminiModel,
}) {
  const videoFilename = `${uuidv4()}.mp4`;
  const combinedAudioFilename = `${uuidv4()}.mp3`;
  const videoFilePath = path.join(videoDir, videoFilename);
  const combinedAudioFilePath = path.join(audioDir, combinedAudioFilename);

  const slidePaths = [];
  const audioPaths = [];
  const audioListFilePath = path.join(videoDir, `${uuidv4()}_audio_list.txt`);
  const videoListFilePath = path.join(videoDir, `${uuidv4()}_video_list.txt`);

  try {
    const prompt = buildSlideGenerationPrompt(text, language);
    const rawResponse = await callLlm(prompt, aiProvider, aiModel, getNextGroqClient, getNextGeminiModel);

    let payload;
    try {
      payload = parseSlideGenerationResponse(rawResponse);
    } catch (err) {
      console.error('Failed to parse AI slide generation:', err);
      payload = {
        slides: [{
          narration_text: text,
          display_text: text.substring(0, 200),
          slide_bg_color: '#1e3a5f',
          layout_type: 'full-text',
          image_search_keyword: 'education learning classroom',
        }],
        interactive_quizzes: [],
      };
    }

    const slides = Array.isArray(payload.slides) ? payload.slides : [];
    if (slides.length === 0) {
      throw new Error('No slides generated');
    }

    const voice = resolveEdgeVoice(language);
    let videoListContent = '';
    let audioListContent = '';
    let totalAudioDuration = 0;
    const slideEndTimes = [];

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const narrationText = slide.narration_text || slide.explanation_content || ' ';
      const displayText = slide.display_text || slide.slide_content || ' ';
      const bgColor = slide.slide_bg_color || '#1e3a5f';
      const layoutType = slide.layout_type || 'text-left-image-right';
      const keyword = slide.image_search_keyword || 'education abstract';

      const slideAudioFilename = `${uuidv4()}_slide.mp3`;
      const slideAudioFilePath = path.join(audioDir, slideAudioFilename);

      await generateAudioFile(narrationText, voice, slideAudioFilePath);
      audioPaths.push(slideAudioFilePath);
      audioListContent += `file '${slideAudioFilePath.replace(/\\/g, '/')}'\n`;

      let duration = await getAudioDuration(slideAudioFilePath);
      if (duration < 1.0) duration = 1.0;
      totalAudioDuration += duration;
      slideEndTimes.push(totalAudioDuration);

      let imageResult = null;
      if (layoutType !== 'full-text') {
        imageResult = await resolveSlideImage(keyword, bgColor);
      }

      const slideBuffer = await renderSlide(
        { display_text: displayText, slide_bg_color: bgColor, layout_type: layoutType },
        imageResult
      );

      const slideImageFilename = `${uuidv4()}_slide.jpg`;
      const slideImageFilePath = path.join(videoDir, slideImageFilename);
      fs.writeFileSync(slideImageFilePath, slideBuffer);
      // free large buffers immediately
      imageResult = null;
      slidePaths.push(slideImageFilePath);

      videoListContent += `file '${slideImageFilePath.replace(/\\/g, '/')}'\n`;
      videoListContent += `duration ${duration.toFixed(2)}\n`;
    }

    videoListContent += `file '${slidePaths[slidePaths.length - 1].replace(/\\/g, '/')}'\n`;

    fs.writeFileSync(videoListFilePath, videoListContent);
    fs.writeFileSync(audioListFilePath, audioListContent);

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(audioListFilePath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c:a libmp3lame'])
        .save(combinedAudioFilePath)
        .on('end', resolve)
        .on('error', reject);
    });

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(videoListFilePath)
        .inputOptions(['-f concat', '-safe 0'])
        .input(combinedAudioFilePath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-pix_fmt', 'yuv420p',
          `-t ${totalAudioDuration.toFixed(2)}`,
          '-preset ultrafast',
          '-crf 28',
          '-threads 1',
        ])
        .save(videoFilePath)
        .on('end', resolve)
        .on('error', reject);
    });

    slidePaths.forEach((p) => { try { fs.unlinkSync(p); } catch { /* ignore */ } });
    audioPaths.forEach((p) => { try { fs.unlinkSync(p); } catch { /* ignore */ } });
    try { fs.unlinkSync(videoListFilePath); } catch { /* ignore */ }
    try { fs.unlinkSync(audioListFilePath); } catch { /* ignore */ }

    const interactiveQuizzes = buildQuizTimestamps(payload.interactive_quizzes, slideEndTimes);

    return {
      videoUrl: `/api/video/${videoFilename}`,
      audioUrl: `/api/audio/${combinedAudioFilename}`,
      interactiveQuizzes,
      slidesJson: JSON.stringify(slides),
      quizzesJson: JSON.stringify(interactiveQuizzes),
    };
  } catch (error) {
    slidePaths.forEach((p) => { try { fs.unlinkSync(p); } catch { /* ignore */ } });
    audioPaths.forEach((p) => { try { fs.unlinkSync(p); } catch { /* ignore */ } });
    try { fs.unlinkSync(videoListFilePath); } catch { /* ignore */ }
    try { fs.unlinkSync(audioListFilePath); } catch { /* ignore */ }
    throw error;
  }
}

module.exports = { generateVideo };
