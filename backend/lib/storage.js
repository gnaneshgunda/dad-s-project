const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let supabase = null;

function getSupabase() {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  // Disable Realtime transport — storage uses plain HTTPS and never needs
  // WebSocket. Without this, @supabase/supabase-js throws a Node.js <22
  // WebSocket compatibility error even on Node 22 due to package version
  // detection bugs, crashing unrelated operations like video uploads.
  supabase = createClient(url, key, {
    realtime: { transport: null },
    global: { fetch: globalThis.fetch },
  });
  return supabase;
}

async function ensureBuckets() {
  const client = getSupabase();
  if (!client) return;
  try {
    const { data: buckets, error } = await client.storage.listBuckets();
    if (error) { console.warn('Storage bucket check failed:', error.message); return; }
    const existing = new Set((buckets || []).map(b => b.name));
    for (const name of ['videos', 'audio']) {
      if (!existing.has(name)) {
        const { error: ce } = await client.storage.createBucket(name, { public: true });
        if (ce) console.error(`Failed to create bucket "${name}":`, ce.message);
        else console.log(`Storage bucket "${name}" created`);
      }
    }
  } catch (err) {
    // Non-fatal — server can still serve videos locally if storage is unavailable
    console.warn('Storage bucket setup failed (will use local fallback):', err.message);
  }
}

// Returns public URL if uploaded, null on any error (caller falls back to local serving)
async function uploadFile(localPath, bucket, remoteName) {
  const client = getSupabase();
  if (!client) return null;

  try {
    const buffer = fs.readFileSync(localPath);
    const ext = path.extname(localPath).toLowerCase();
    const mimeTypes = { '.mp4': 'video/mp4', '.mp3': 'audio/mpeg' };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    const { error } = await client.storage
      .from(bucket)
      .upload(remoteName, buffer, { contentType, upsert: true });

    if (error) {
      console.warn(`Supabase upload failed for ${remoteName} (using local fallback):`, error.message);
      return null;
    }

    const { data } = client.storage.from(bucket).getPublicUrl(remoteName);
    return data.publicUrl;
  } catch (err) {
    // Catches WebSocket / network errors — job continues with local file serving
    console.warn(`Supabase upload threw for ${remoteName} (using local fallback):`, err.message);
    return null;
  }
}

async function uploadVideo(localPath, filename) {
  return uploadFile(localPath, 'videos', filename);
}

async function uploadAudio(localPath, filename) {
  return uploadFile(localPath, 'audio', filename);
}

module.exports = { uploadVideo, uploadAudio, getSupabase, ensureBuckets };
