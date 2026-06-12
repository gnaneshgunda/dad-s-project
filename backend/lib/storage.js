const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let supabase = null;

function getSupabase() {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  supabase = createClient(url, key);
  return supabase;
}

// Returns public URL if uploaded, null if Supabase not configured (falls back to local)
async function uploadFile(localPath, bucket, remoteName) {
  const client = getSupabase();
  if (!client) return null;

  const buffer = fs.readFileSync(localPath);
  const ext = path.extname(localPath).toLowerCase();
  const mimeTypes = { '.mp4': 'video/mp4', '.mp3': 'audio/mpeg' };
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  const { error } = await client.storage
    .from(bucket)
    .upload(remoteName, buffer, { contentType, upsert: true });

  if (error) {
    console.error(`Supabase upload failed for ${remoteName}:`, error.message);
    return null;
  }

  const { data } = client.storage.from(bucket).getPublicUrl(remoteName);
  return data.publicUrl;
}

async function uploadVideo(localPath, filename) {
  return uploadFile(localPath, 'videos', filename);
}

async function uploadAudio(localPath, filename) {
  return uploadFile(localPath, 'audio', filename);
}

module.exports = { uploadVideo, uploadAudio, getSupabase };
