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
