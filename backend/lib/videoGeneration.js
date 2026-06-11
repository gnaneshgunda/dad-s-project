const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');
const {
  buildIntentClassifierPrompt,
  buildDynamicSlidePrompt,
  parseBlueprintResponse,
  parseSlideGenerationResponse,
} = require('./llmPrompts');
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

async function generateVideo({
  text,
  originalTopic,
  aiProvider,
  aiModel,
  language,
  promptType,
  audioDir,
  videoDir,
  callLlm,
  onProgress,
}) {
  const report = (step, percent) => { if (onProgress) onProgress(step, percent); };
  const videoFilename = `${uuidv4()}.mp4`;
  const combinedAudioFilename = `${uuidv4()}.mp3`;
  const videoFilePath = path.join(videoDir, videoFilename);
  const combinedAudioFilePath = path.join(audioDir, combinedAudioFilename);

  const slidePaths = [];
  const audioPaths = [];
  const audioListFilePath = path.join(videoDir, `${uuidv4()}_audio_list.txt`);
  const videoListFilePath = path.join(videoDir, `${uuidv4()}_video_list.txt`);

  try {
    const userQuery = originalTopic || text;
    const mode = promptType || 'explain-detailed';

    // Stage 1 — Content strategist: produce blueprint
    console.log('Stage 1: generating content blueprint...');
    const blueprintPrompt = buildIntentClassifierPrompt(userQuery);
    report('blueprint', 20);
    const blueprintRaw = await callLlm(blueprintPrompt, aiProvider, aiModel);

    let blueprint;
    try {
      blueprint = parseBlueprintResponse(blueprintRaw);
      if (!Array.isArray(blueprint.slide_plan) || blueprint.slide_plan.length === 0) {
        throw new Error('Blueprint missing slide_plan');
      }
      console.log(`Stage 1 complete: intent="${blueprint.intent}", ${blueprint.slide_plan.length} slides planned`);
    } catch (err) {
      console.error('Stage 1 blueprint parse failed:', err.message);
      blueprint = {
        intent: 'explain a topic',
        language_code: (language || 'en').split('-')[0],
        slide_plan: [{
          slide_number: 1,
          title: userQuery.substring(0, 80),
          purpose: 'Cover the user topic',
          narration_length: 'medium',
          needs_image: false,
          image_search_keyword: '',
          layout_type: 'full-text',
          display_style: 'bullets',
        }],
        quiz_plan: [],
        narration_tone: 'clear educational narrator',
      };
    }

    // Stage 2 — Slide writer: execute blueprint
    console.log('Stage 2: writing slides from blueprint...');
    const slidePrompt = buildDynamicSlidePrompt(blueprint, userQuery, mode);
    report('slides', 45);
    const rawResponse = await callLlm(slidePrompt, aiProvider, aiModel);

    let payload;
    try {
      payload = parseSlideGenerationResponse(rawResponse);
      console.log(`Stage 2 complete: ${payload.slides?.length || 0} slides written`);
    } catch (err) {
      console.error('Stage 2 slide parse failed:', err.message);
      payload = {
        slides: [{
          narration_text: text,
          display_text: text.substring(0, 200),
          slide_bg_color: '#1e3a5f',
          layout_type: 'full-text',
          image_search_keyword: '',
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

    report('rendering', 60);
    for (let i = 0; i < slides.length; i++) {
      report('rendering', 60 + Math.floor((i / slides.length) * 25));
      const slide = slides[i];
      const narrationText = slide.narration_text || slide.explanation_content || ' ';
      const displayText = slide.display_text || slide.slide_content || ' ';
      const bgColor = slide.slide_bg_color || '#1e3a5f';
      const layoutType = slide.layout_type || 'full-text';
      const keyword = slide.image_search_keyword || '';

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
      const wantsImage = layoutType !== 'full-text' && keyword.trim().length > 0;
      if (wantsImage) {
        imageResult = await resolveSlideImage(keyword, bgColor);
        if (!imageResult || imageResult.isFallback) {
          console.warn(`Slide ${i + 1}: no Pexels image for keyword "${keyword}", using fallback`);
        }
      }

      const slideBuffer = await renderSlide(
        { display_text: displayText, slide_bg_color: bgColor, layout_type: layoutType },
        imageResult,
        language
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
      blueprintJson: JSON.stringify(blueprint),
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
