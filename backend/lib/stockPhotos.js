const fs = require('fs');
const path = require('path');
const { createClient } = require('pexels');
const { loadImage } = require('canvas');

const FALLBACK_CACHE_DIR = path.join(__dirname, '..', 'assets');

async function downloadImageBuffer(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    throw new Error(`Image download failed: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function fetchStockImage(keyword) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey || !keyword?.trim()) {
    return null;
  }

  try {
    const client = createClient(apiKey);
    const result = await client.photos.search({
      query: keyword.trim(),
      per_page: 1,
      orientation: 'landscape',
    });

    const photo = result.photos?.[0];
    if (!photo) return null;

    const url = photo.src.large2x || photo.src.large || photo.src.original;
    const buffer = await downloadImageBuffer(url);
    return { buffer, attribution: photo.photographer };
  } catch (err) {
    console.warn('Pexels fetch failed:', err.message);
    return null;
  }
}

async function createFallbackImage(keyword, bgColor = '#1e3a5f') {
  const fallbackPath = path.join(FALLBACK_CACHE_DIR, 'fallback-gradient.png');
  if (fs.existsSync(fallbackPath)) {
    try {
      const img = await loadImage(fallbackPath);
      return { image: img, isFallback: true };
    } catch {
      // generate procedurally below
    }
  }

  const { createCanvas } = require('canvas');
  const canvas = createCanvas(800, 600);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 800, 600);
  gradient.addColorStop(0, bgColor);
  gradient.addColorStop(1, '#0f172a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 800, 600);

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(400, 300, 60 + i * 45, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = (keyword || 'Educational Content').slice(0, 40);
  ctx.fillText(label, 400, 300);

  const buffer = canvas.toBuffer('image/png');
  const img = await loadImage(buffer);
  return { image: img, isFallback: true };
}

async function resolveSlideImage(keyword, bgColor) {
  const stock = await fetchStockImage(keyword);
  if (stock?.buffer) {
    try {
      const image = await loadImage(stock.buffer);
      return { image, isFallback: false };
    } catch (err) {
      console.warn('Failed to load downloaded stock image:', err.message);
    }
  }
  return createFallbackImage(keyword, bgColor);
}

module.exports = {
  fetchStockImage,
  createFallbackImage,
  resolveSlideImage,
};
