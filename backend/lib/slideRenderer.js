const { createCanvas, registerFont } = require('canvas');
const path = require('path');

// Register Indic script fonts so node-canvas can render them
const FONTS_DIR = path.join(__dirname, '..', 'assets', 'fonts');

const FONT_REGISTRATIONS = [
  { file: 'NotoSansTelugu-Regular.ttf', family: 'Noto Sans Telugu', weight: 'normal' },
  { file: 'NotoSansTelugu-Bold.ttf',    family: 'Noto Sans Telugu', weight: 'bold' },
  { file: 'NotoSansDevanagari-Regular.ttf', family: 'Noto Sans Devanagari', weight: 'normal' },
  { file: 'NotoSansDevanagari-Bold.ttf',    family: 'Noto Sans Devanagari', weight: 'bold' },
];
for (const f of FONT_REGISTRATIONS) {
  try { registerFont(path.join(FONTS_DIR, f.file), { family: f.family, weight: f.weight }); } catch { /* ignore */ }
}

// Map voice/language codes to the font family that can render their script
const SCRIPT_FONT = {
  te: 'Noto Sans Telugu',
  hi: 'Noto Sans Devanagari',
  mr: 'Noto Sans Devanagari',
};

function getFontFamily(language) {
  const code = (language || 'en').toLowerCase().split('-')[0];
  return SCRIPT_FONT[code] || '"Segoe UI", Arial, sans-serif';
}

const FRAME_W = 960;
const FRAME_H = 540;
const MARGIN = 48;
const CARD_RADIUS = 24;
const IMAGE_RADIUS = 16;

function parseHexColor(hex, fallback = '#1e3a5f') {
  if (!hex || typeof hex !== 'string') return fallback;
  const cleaned = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) return cleaned;
  if (/^#[0-9a-fA-F]{3}$/.test(cleaned)) {
    const r = cleaned[1];
    const g = cleaned[2];
    const b = cleaned[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

function hexToRgb(hex) {
  const color = parseHexColor(hex);
  return {
    r: parseInt(color.slice(1, 3), 16),
    g: parseInt(color.slice(3, 5), 16),
    b: parseInt(color.slice(5, 7), 16),
  };
}

function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function mixColor(hex, targetHex, ratio) {
  const a = hexToRgb(hex);
  const b = hexToRgb(targetHex);
  return rgbToHex(
    a.r + (b.r - a.r) * ratio,
    a.g + (b.g - a.g) * ratio,
    a.b + (b.b - a.b) * ratio
  );
}

function drawGradientBackground(ctx, baseColor) {
  const color = parseHexColor(baseColor);
  const lighter = mixColor(color, '#ffffff', 0.12);
  const darker = mixColor(color, '#000000', 0.45);
  const accent = mixColor(color, '#6366f1', 0.25);

  const bgGrad = ctx.createLinearGradient(0, 0, FRAME_W, FRAME_H);
  bgGrad.addColorStop(0, lighter);
  bgGrad.addColorStop(0.55, color);
  bgGrad.addColorStop(1, darker);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, FRAME_W, FRAME_H);

  const radial = ctx.createRadialGradient(FRAME_W * 0.85, FRAME_H * 0.15, 20, FRAME_W * 0.85, FRAME_H * 0.15, 420);
  radial.addColorStop(0, `${accent}55`);
  radial.addColorStop(1, `${accent}00`);
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, FRAME_W, FRAME_H);

  const radial2 = ctx.createRadialGradient(FRAME_W * 0.1, FRAME_H * 0.9, 10, FRAME_W * 0.1, FRAME_H * 0.9, 380);
  radial2.addColorStop(0, `${lighter}33`);
  radial2.addColorStop(1, `${lighter}00`);
  ctx.fillStyle = radial2;
  ctx.fillRect(0, 0, FRAME_W, FRAME_H);
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCard(ctx, x, y, w, h) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, CARD_RADIUS);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRectPath(ctx, x, y, w, h, CARD_RADIUS);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function wrapLines(ctx, text, maxWidth, titleSize, bodySize, fontFamily) {
  const paragraphs = String(text || '').split('\n');
  const lines = [];

  paragraphs.forEach((paragraph, pIndex) => {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      lines.push({ text: '', type: 'spacer' });
      return;
    }

    const isTitle = pIndex === 0;
    const fontSize = isTitle ? titleSize : bodySize;
    ctx.font = isTitle ? `bold ${fontSize}px ${fontFamily}` : `${fontSize}px ${fontFamily}`;

    const words = trimmed.split(/\s+/);
    let current = '';
    words.forEach((word) => {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push({ text: current, type: isTitle ? 'title' : 'body' });
        current = word;
      } else {
        current = test;
      }
    });
    if (current) {
      lines.push({ text: current, type: isTitle ? 'title' : 'body' });
    }
  });

  return lines;
}

function fitTextLayout(ctx, text, maxWidth, maxHeight, fontFamily) {
  let titleSize = 44;
  let bodySize = 28;
  const lineHeight = 1.45;

  while (titleSize >= 22) {
    const lines = wrapLines(ctx, text, maxWidth, titleSize, bodySize, fontFamily);
    let totalHeight = 0;
    lines.forEach((line) => {
      if (line.type === 'spacer') { totalHeight += bodySize * 0.5; return; }
      totalHeight += (line.type === 'title' ? titleSize : bodySize) * lineHeight;
    });
    if (totalHeight <= maxHeight) return { lines, titleSize, bodySize, lineHeight, totalHeight };
    titleSize -= 2;
    bodySize -= 1.5;
  }

  const lines = wrapLines(ctx, text, maxWidth, titleSize, bodySize, fontFamily);
  let totalHeight = 0;
  lines.forEach((line) => {
    if (line.type === 'spacer') return;
    totalHeight += (line.type === 'title' ? titleSize : bodySize) * lineHeight;
  });
  return { lines, titleSize, bodySize, lineHeight, totalHeight };
}

function drawTextBlock(ctx, text, x, y, w, h, fontFamily) {
  const padding = 32;
  drawCard(ctx, x, y, w, h);

  const innerX = x + padding;
  const innerY = y + padding;
  const innerW = w - padding * 2;
  const innerH = h - padding * 2;

  const layout = fitTextLayout(ctx, text, innerW, innerH, fontFamily);
  let cursorY = innerY + Math.max(0, (innerH - layout.totalHeight) / 2);

  layout.lines.forEach((line) => {
    if (line.type === 'spacer') { cursorY += layout.bodySize * 0.5; return; }
    const size = line.type === 'title' ? layout.titleSize : layout.bodySize;
    ctx.font = line.type === 'title' ? `bold ${size}px ${fontFamily}` : `${size}px ${fontFamily}`;
    ctx.fillStyle = line.type === 'title' ? '#0f172a' : '#334155';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(line.text, innerX, cursorY);
    cursorY += size * layout.lineHeight;
  });
}

function drawImageCover(ctx, image, x, y, w, h, radius = IMAGE_RADIUS) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.clip();

  const scale = Math.max(w / image.width, h / image.height);
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  const drawX = x + (w - drawW) / 2;
  const drawY = y + (h - drawH) / 2;
  ctx.drawImage(image, drawX, drawY, drawW, drawH);
  ctx.restore();

  ctx.save();
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawLayout(ctx, slide, image, fontFamily) {
  const layout = slide.layout_type || 'text-left-image-right';
  const contentH = FRAME_H - MARGIN * 2;

  switch (layout) {
    case 'text-right-image-left': {
      const imageW = Math.floor(FRAME_W * 0.42);
      const textW = FRAME_W - imageW - MARGIN * 3;
      drawImageCover(ctx, image, MARGIN, MARGIN, imageW, contentH);
      drawTextBlock(ctx, slide.display_text, MARGIN * 2 + imageW, MARGIN, textW, contentH, fontFamily);
      break;
    }
    case 'split-card': {
      const halfW = (FRAME_W - MARGIN * 3) / 2;
      drawTextBlock(ctx, slide.display_text, MARGIN, MARGIN, halfW, contentH, fontFamily);
      drawImageCover(ctx, image, MARGIN + halfW + MARGIN, MARGIN, halfW, contentH, CARD_RADIUS);
      break;
    }
    case 'centered-hero': {
      const heroH = Math.floor(contentH * 0.48);
      const textH = contentH - heroH - 24;
      const heroW = FRAME_W - MARGIN * 2;
      drawImageCover(ctx, image, MARGIN, MARGIN, heroW, heroH, CARD_RADIUS);
      drawTextBlock(ctx, slide.display_text, MARGIN, MARGIN + heroH + 24, heroW, textH, fontFamily);
      break;
    }
    case 'full-text': {
      drawTextBlock(ctx, slide.display_text, MARGIN, MARGIN, FRAME_W - MARGIN * 2, contentH, fontFamily);
      break;
    }
    case 'text-left-image-right':
    default: {
      const imageW = Math.floor(FRAME_W * 0.42);
      const textW = FRAME_W - imageW - MARGIN * 3;
      drawTextBlock(ctx, slide.display_text, MARGIN, MARGIN, textW, contentH, fontFamily);
      drawImageCover(ctx, image, MARGIN * 2 + textW, MARGIN, imageW, contentH);
      break;
    }
  }
}

async function renderSlide(slide, imageResult, language) {
  const canvas = createCanvas(FRAME_W, FRAME_H);
  const ctx = canvas.getContext('2d');
  const fontFamily = getFontFamily(language);

  drawGradientBackground(ctx, slide.slide_bg_color || '#1e3a5f');

  const layout = slide.layout_type || 'text-left-image-right';
  if (layout === 'full-text') {
    drawTextBlock(ctx, slide.display_text, MARGIN, MARGIN, FRAME_W - MARGIN * 2, FRAME_H - MARGIN * 2, fontFamily);
  } else if (imageResult?.image) {
    drawLayout(ctx, slide, imageResult.image, fontFamily);
  } else {
    drawTextBlock(ctx, slide.display_text, MARGIN, MARGIN, FRAME_W - MARGIN * 2, FRAME_H - MARGIN * 2, fontFamily);
  }

  return canvas.toBuffer('image/jpeg', { quality: 0.82 });
}

module.exports = {
  renderSlide,
  FRAME_W,
  FRAME_H,
};
