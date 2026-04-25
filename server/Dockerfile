# ── Stage 1: Install deps & build ──────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm i typescript
RUN npm run build


# ── Stage 2: Production deps only ─────────────────────
FROM node:22-alpine AS prod-deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force


# ── Stage 3a: API server (lightweight — no FFmpeg) ─────
FROM node:22-alpine AS api

WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

CMD ["node", "dist/index.js"]

# ── Stage 3b: Worker (with FFmpeg for transcoding) ─────
FROM node:22-alpine AS worker

# Only workers need FFmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

CMD ["node", "dist/worker.js"]


# ── Stage 3c: AI Worker (FFmpeg + faster-whisper) ──────────────────────────
# Uses node:22-slim (Debian) instead of Alpine because PyAV (a faster-whisper
# dependency) has no pre-built musl/Alpine wheels and its Cython compilation
# fails on Python 3.12 + Alpine. Debian has pre-built wheels → no compilation
# needed, faster build, smaller attack surface.
#
# Available WHISPER_MODEL values (ascending size / accuracy):
#   tiny (~75 MB) | base (~150 MB) | small (~500 MB) | medium | large
FROM node:22-slim AS ai-worker

# 1. System packages (Debian-based)
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        python3 \
        python3-pip \
        python3-venv \
    && rm -rf /var/lib/apt/lists/*

# 2. Isolated Python venv + faster-whisper (CTranslate2-based, no PyTorch)
#    Pre-built PyAV wheels on Debian → no compilation required.
ENV VIRTUAL_ENV=/opt/whisper-venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

RUN python3 -m venv "$VIRTUAL_ENV" && \
    pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir faster-whisper

# 3. Pre-download model weights at build time so startup is instant
#    compute_type=int8 → efficient CPU inference, no accuracy loss for most tasks
ARG WHISPER_MODEL=base
ENV WHISPER_MODEL=${WHISPER_MODEL}
RUN python3 -c "\
from faster_whisper import WhisperModel; \
WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')"

# 4. Node.js application
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder   /app/dist         ./dist
COPY package.json ./

CMD ["node", "dist/ai-worker.js"]
