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
# Uses python:3.11-slim as the base to avoid installing python3, pip, and venv via apt-get,
# and copies Node.js from node:22-slim.
FROM python:3.11-slim AS ai-worker

# 1. Copy Node.js from official slim image
COPY --from=node:22-slim /usr/local /usr/local

# 2. System packages (Debian-based)
#    Use BuildKit cache mounts to cache apt package downloads
RUN rm -f /etc/apt/apt.conf.d/docker-clean; echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg

# 3. Install faster-whisper (CTranslate2-based, no PyTorch)
#    Use BuildKit cache mount to cache pip packages across builds
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && \
    pip install faster-whisper

# 4. Pre-download model weights at build time so startup is instant
ARG WHISPER_MODEL=base
ENV WHISPER_MODEL=${WHISPER_MODEL}
RUN python3 -c "\
from huggingface_hub import snapshot_download; \
snapshot_download(repo_id='Systran/faster-whisper-${WHISPER_MODEL}')"

# 5. Node.js application
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder   /app/dist         ./dist
COPY package.json ./

CMD ["node", "dist/ai-worker.js"]
