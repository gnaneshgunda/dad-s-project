FROM node:20-slim

# Install native build deps for canvas, bcrypt, and prisma
# (ffmpeg is removed here, assuming you use ffmpeg-static as Q suggested)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    fonts-noto-core \
    fonts-noto-extra \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -fv

WORKDIR /app

# Copy package files and prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (skips devDependencies, runs prisma generate)
RUN npm ci --omit=dev

# Copy the rest of the application code
COPY . .

# HF FIX: Make the /app directory readable/writable so FFmpeg 
# can actually save the generated MP4 files without crashing.
RUN chmod -R 777 /app

# HF FIX: Force the environment and container to use port 7860
ENV PORT=7860
EXPOSE 7860

# Sync schema to Supabase, then start the server
CMD ["sh", "-c", "npx prisma db push --accept-data-loss 2>&1 | tail -5 && node server.js"]