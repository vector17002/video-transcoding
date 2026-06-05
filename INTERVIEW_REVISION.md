# Video Processing Pipeline — Interview Revision Guide

---

## 1. Project Overview

A **Proof of Concept** for a production-grade video processing pipeline. Users upload videos that are then asynchronously transcoded, segmented into HLS streams, thumbnailed, transcribed (speech-to-text), and summarized — all without blocking the API server.

**Core problem it solves:** Video processing is CPU/time intensive. Doing it synchronously would block the HTTP server. The design off-loads all heavy work to decoupled background workers.

---

## 2. Full Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 16 (App Router) + React 19 | SSR, file upload UI |
| Styling | Tailwind CSS 4 | Utility-first rapid UI |
| Backend API | Node.js + Express 5 | REST API, pre-signed URL generation |
| Language | TypeScript (ESM, `module: nodenext`) | Type safety, `.js` extensions in imports |
| Database | PostgreSQL (Neon) | Managed serverless Postgres |
| ORM | Drizzle ORM | Type-safe SQL, schema-as-code |
| Task Queue | BullMQ + Redis | Async job queuing with retries |
| Video Processing | FFmpeg via `fluent-ffmpeg` | Transcode, HLS segmentation, thumbnails |
| Speech-to-text | faster-whisper (Python) | CPU-efficient Whisper inference |
| AI Summarization | Gemini 3.1 Pro (via `deepagents`) | LLM-based transcript summarization |
| Storage | AWS S3 | Object storage for all media assets |
| Containerization | Docker + Docker Compose | Multi-service local dev & deploy |
| CI/CD | GitHub Actions → Amazon ECR → ECS | Automated build & deploy pipeline |
| Auth | JWT + bcrypt | Stateless auth, hashed passwords |

---

## 3. High-Level Architecture

```
User Browser
    │
    │  1. POST /api/s3/upload → get pre-signed URL + fileId
    │  2. PUT <pre-signed URL> → upload directly to S3 (bypasses server)
    │  3. POST /api/s3/process → trigger processing pipeline
    ▼
Express API Server (api container)
    │
    ├── Writes video record to PostgreSQL (status: processing)
    ├── Stores metadata in Redis (fileId → { userId, contentType })
    └── Enqueues transcodeJob → BullMQ → Redis
                │
                ▼
        Transcode Worker (worker container)
                │
                ├── Downloads video from S3 via pre-signed URL
                ├── Runs FFmpeg → 4 resolutions (1080p, 720p, 480p, 360p)
                ├── Uploads .mp4 files back to S3
                │
                ├── Enqueues → thumbnailQueue (parallel)
                ├── Enqueues → hlsQueue (after transcode)
                └── Enqueues → transcribeQueue (parallel)
                        │
              ┌─────────┼─────────┐
              ▼         ▼         ▼
        Thumbnail    HLS       Transcribe & Summary Worker (ai-worker container)
        Worker       Worker       │
              │         │         ├── transcribeWorker:
              │         │         │   ├── Downloads original video
              │         │         │   ├── Extracts 16kHz mono WAV (FFmpeg)
              │         │         │   ├── Runs faster-whisper (Python subprocess)
              │         │         │   ├── Uploads transcript.json → S3
              │         │         │   └── Enqueues plainText → summaryQueue
              │         │         │
              │         │         └── summaryWorker:
              │         │             └── Invokes Gemini API (deepagents)
              │         │                 Saves summary text to DB
              │         │                 Updates summaryStatus to completed
              │         │
              │         └── Segments each resolution into .ts + .m3u8
              │             Uploads HLS files → S3
              │
              └── Extracts 1 frame/5s → thumb_001.jpg … default.jpg
                  Uploads thumbnails → S3
```

---

## 4. Key Design Decisions & Concepts

### 4.1 Direct S3 Upload (Pre-signed URLs)

**Problem:** If the client uploads the video through the Express server, it would consume the server's bandwidth and memory for every upload.

**Solution:** The server generates a **pre-signed PUT URL** (signed with AWS credentials, valid for 50 min) and returns it to the frontend. The browser uploads directly to S3, the server never sees the bytes.

```
Frontend → GET pre-signed URL from backend → PUT video bytes directly to S3
```

**Interview angle:** "Why not upload through server?" → bandwidth bottleneck, single point of failure, memory pressure.

**Code:** `getUploadUrl()` in `utils/getPresignedUrl.ts` uses `@aws-sdk/s3-request-presigner`.

S3 key convention:
```
{env}/users/{userId}/{fileId}/original          ← uploaded video
{env}/users/{userId}/{fileId}/resolutions/720p.mp4
{env}/users/{userId}/{fileId}/hls/720p/segment_000.ts
{env}/users/{userId}/{fileId}/thumbnails/thumb_001.jpg
{env}/users/{userId}/{fileId}/transcript.json
```

---

### 4.2 Asynchronous Job Queue (BullMQ + Redis)

**BullMQ** is a Node.js job queue library built on top of Redis. Jobs are serialized as JSON and stored in Redis sorted sets/lists.

**Why BullMQ over alternatives?**
- Built-in retry with exponential backoff
- Job persistence (survives restarts)
- Separate producer (API) and consumer (worker) processes
- Job events (completed/failed listeners)

**Queues in this project:**

| Queue | Producer | Consumer | Retry Config |
|---|---|---|---|
| `transcodeQueue` | `s3ProcessService` | `transcodeWorker` | 5 attempts, exponential 3s base |
| `hlsQueue` | `transcodeWorker` | `hlsWorker` | default |
| `thumbnailQueue` | `transcodeWorker` | `thumbnailWorker` | default |
| `transcribeQueue` | `transcodeWorker` | `transcribeWorker` | default |
| `summaryQueue` | `transcribeWorker` | `summaryWorker` | 5 attempts, exponential 5s base |

**Exponential Backoff Formula:**
```
delay = BASE_DELAY × 2^(attemptsMade - 1)
→ Attempt 1: 3s, Attempt 2: 6s, Attempt 3: 12s, Attempt 4: 24s
```

**Job lifecycle:** `waiting → active → completed | failed → (retry if attempts left)`

**`removeOnComplete: true`** — completed jobs are cleaned from Redis to save memory.
**`removeOnFail: false`** — failed jobs stay for inspection/debugging.

---

### 4.3 Video Transcoding (FFmpeg)

**What is transcoding?** Converting a video from one format/resolution/codec to another.

**Why multiple resolutions?** Adaptive bitrate streaming — the player picks the right quality for the viewer's bandwidth (Adaptive Bitrate Streaming / ABR).

**Process:**
1. Download original from S3 (via pre-signed URL → axios → local disk)
2. Run FFmpeg in parallel across 4 resolutions using `Promise.all`:
   - `1920x1080` (1080p), `1280x720` (720p), `854x480` (480p), `640x360` (360p)
3. Codec: `libx264` (video) + `aac` (audio)
4. Upload all `.mp4` files to S3
5. Delete local originals after upload

**Interview angle:** "Why run transcodes in parallel?" → `Promise.all` — all 4 FFmpeg processes run concurrently, not sequentially, cutting total time to that of the slowest resolution.

---

### 4.4 HLS (HTTP Live Streaming)

**What is HLS?** A streaming protocol by Apple. A video is split into small `.ts` (MPEG-TS) segment files (e.g., 6s each) and a `.m3u8` playlist manifest that lists all segments. The player fetches segments on demand.

**Why HLS over serving raw .mp4?**
- Seekable without downloading the entire file
- Adaptive bitrate switching (player swaps playlists mid-stream)
- CDN-friendly (small cacheable chunks)

**HLS key files:**
- `720p.m3u8` — playlist manifest
- `segment_000.ts`, `segment_001.ts` … — 6-second chunks

**FFmpeg flags used:**
```
-codec copy       → no re-encoding (just repackage existing h264 into .ts)
-hls_time 6       → 6-second segments
-hls_list_size 0  → include all segments in playlist (VOD mode)
```

**Optimization:** HLS worker receives `localPath` from the transcode worker via job data — avoids re-downloading already-transcoded files from S3.

---

### 4.5 Thumbnail Generation

- FFmpeg extracts **1 frame every 5 seconds**: `-vf fps=1/5`
- Output: `thumb_001.jpg`, `thumb_002.jpg`, …
- `thumb_001.jpg` is copied as `default.jpg` (cover image)
- All thumbnails uploaded to S3, local files deleted immediately after upload

**Triggered in parallel** with transcoding by the transcode worker (both jobs enqueued before transcoding blocks).

---

### 4.6 Speech-to-Text with faster-whisper

**faster-whisper** is a re-implementation of OpenAI Whisper using CTranslate2 — runs on CPU with `int8` quantization (much faster than original Whisper, no GPU needed).

**Pipeline:**
1. Download original video from S3
2. FFmpeg extracts **mono 16kHz WAV** — Whisper's preferred input format
3. Run faster-whisper via **Python subprocess** (inline Python script via `-c` flag)
4. Parse JSON output: `{ language, duration, segments: [{start, end, text}] }`
5. Combine into `plainText`, upload `transcript.json` to S3
6. Store S3 key in DB (`transcriptKey`), update `transcriptStatus`

**Why Python subprocess from Node.js?** faster-whisper is a Python library. Spawning a Python process from Node using `child_process.spawn` avoids maintaining a separate HTTP service.

**Why Debian (node:22-slim) not Alpine for ai-worker?**
- PyAV (faster-whisper dependency) has no pre-built Alpine/musl wheels
- Its Cython compilation fails on Python 3.12 + Alpine
- Debian has pre-built wheels → no compilation needed → faster builds

**Model weights baked into Docker image at build time:**
```dockerfile
RUN python3 -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8')"
```
This pre-downloads weights so container startup is instant.

---

### 4.7 AI Summarization (BullMQ Worker in AI Worker Container)

**Design:** The summary generation is processed asynchronously by the `summaryWorker` running inside the `ai-worker` container. When transcription is completed, the `transcribeWorker` enqueues a summarization job with the plain text transcript (`transcript.plainText`) into BullMQ's `summary` queue. The `summaryWorker` picks up the job and calls the Gemini API via the `deepagents` SDK.

**Key details:**
- **Trigger:** Enqueued automatically by `transcribeWorker` with the plain text of the transcript.
- **Library:** Uses the `deepagents` SDK to define an autonomous AI agent (`video-summary-agent`) with system instructions to analyze the plain text and output a concise, structured summary (no extra explanations).
- **LLM:** Powered by `google-genai:gemini-2.5-flash`.
- **Storage:** Persists the final generated summary text directly in the database (`summary` column of `videoTable`) and updates the `summaryStatus` to `completed` or `failed`.

---

### 4.8 Database Schema (Drizzle ORM + PostgreSQL)

**videoTable** — tracks per-video processing state:

| Column | Type | Purpose |
|---|---|---|
| `id` | text PK | fileId (UUID) |
| `userId` | text FK | Owner |
| `status` | enum | Overall: `not-started \| processing \| completed \| failed` |
| `trancodeStatus` | enum | Per-stage status |
| `hlsStatus` | enum | Per-stage status |
| `thumbnailStatus` | enum | Per-stage status |
| `transcriptStatus` | enum | Per-stage status |
| `summaryStatus` | enum | Per-stage status |
| `transcriptKey` | text | S3 path of transcript.json |
| `summaryKey` | text | S3 path of summary |
| `originalVideoKey` | text | S3 path of uploaded video |
| `hlsManifestKey` | text | S3 path of master .m3u8 |

**Why Drizzle over Prisma?** Drizzle is schema-first, generates SQL, has a smaller runtime footprint, and integrates naturally with Neon's serverless HTTP driver.

**Neon** is a serverless Postgres — connection is made via HTTP (`neon-http` driver), suitable for serverless/edge environments.

---

### 4.9 Authentication (JWT + bcrypt)

- **bcrypt** hashes passwords with salt rounds = 10 (industry standard)
- **JWT** is issued on register/login, verified via middleware on protected routes
- Token is passed as `Authorization: Bearer <token>` header or cookie
- `authMiddleware` verifies the token and attaches user to request

---

### 4.10 Docker Multi-Stage Build

The single `Dockerfile` produces **3 separate production images** from shared build stages:

```
Stage 1: builder   → compiles TypeScript → /app/dist
Stage 2: prod-deps → installs only production npm deps

Stage 3a: api      → node:22-alpine  (no FFmpeg) → dist/index.js
Stage 3b: worker   → node:22-alpine + FFmpeg      → dist/worker.js
Stage 3c: ai-worker→ node:22-slim + FFmpeg + Python + faster-whisper → dist/ai-worker.js
```

**Benefits of multi-stage:**
- `api` image is tiny (no FFmpeg, no Python)
- Layer cache: deps stage re-used across all 3 final images
- Each image has exactly what it needs — minimal attack surface

---

### 4.11 CI/CD Pipeline (GitHub Actions → ECR → ECS)

**Trigger:** Push to `main`/`master` on `server/**` or `summary-server/**` paths.

**4-job pipeline:**

```
changes (path detection)
    ├── build-server  (matrix: api | worker | ai-worker)
    │       ├── OIDC auth to AWS (no static IAM keys)
    │       ├── Login to ECR
    │       ├── Build & push with GHA layer cache
    │       └── Tags: {sha}, {branch}, latest (on main only)
    │
    ├── build-summary-server
    │       └── Same pattern for summary-server image
    │
    └── deploy (main only, after builds succeed)
            ├── aws ecs update-service --force-new-deployment (api)
            ├── aws ecs update-service --force-new-deployment (worker)
            └── aws ecs update-service --force-new-deployment (ai-worker)
```

**Key concepts:**
- **OIDC (OpenID Connect):** GitHub Actions exchanges a short-lived OIDC token for AWS credentials — no long-lived `AWS_ACCESS_KEY_ID` secrets needed
- **Path filtering (dorny/paths-filter):** Only rebuilds services whose code changed
- **Docker layer caching:** `cache-from/cache-to: type=gha` uses GitHub Actions cache to speed up subsequent builds
- **Matrix strategy:** Builds api/worker/ai-worker in parallel as separate matrix jobs
- **`provenance: false`:** Keeps manifest format compatible with older ECS task definitions

---

## 5. Data Flow — End to End

```
1. User hits /api/s3/upload
   → Server generates pre-signed PUT URL (S3) + fileId
   → Inserts video row in DB (status: not-started)
   → Stores { userId, contentType } in Redis under fileId

2. Browser uploads video bytes directly to S3 PUT URL

3. User hits /api/s3/process (after upload confirms)
   → Reads metadata from Redis
   → Updates DB status → processing
   → Enqueues transcodeJob in BullMQ

4. transcodeWorker picks up job
   → Downloads video from S3 (pre-signed GET)
   → Spawns FFmpeg × 4 resolutions in parallel
   → Uploads transcoded .mp4s to S3
   → Enqueues thumbnailJob, hlsJob, transcribeJob
   → Updates DB: trancodeStatus → completed

5a. thumbnailWorker
   → Extracts frames with FFmpeg
   → Uploads .jpg files to S3
   → Updates DB: thumbnailStatus → completed

5b. hlsWorker
   → Segments each resolution into .ts + .m3u8 with FFmpeg
   → Uploads all HLS files to S3
   → Updates DB: hlsStatus → completed

5c. transcribeWorker (ai-worker container)
   → Downloads original video
   → Extracts 16kHz mono WAV (FFmpeg)
   → Runs faster-whisper (Python subprocess)
   → Uploads transcript.json to S3
   → Saves S3 key in DB, transcriptStatus → completed
   → Enqueues plain text of transcript in the `summary` queue

6. summaryWorker (ai-worker container)
   → Receives job with the plain text transcript
   → Invokes Gemini API via `deepagents` using the `gemini-2.5-flash` model
   → Extracts summary content and saves it in the database (`summary` column of `videoTable`)
   → Updates DB `summaryStatus` to `completed` (or `failed` if an error occurs)
```

---

## 6. Infrastructure & Local Dev

**Docker Compose services:**
- `redis` — Redis 7 Alpine, healthcheck with `redis-cli ping`
- `api` — API server (lightweight, no FFmpeg)
- `worker` — Transcode + HLS + thumbnail worker (FFmpeg)
- `ai-worker` — AI worker container running both the transcription worker (FFmpeg + Python + Whisper) and the summarization worker (Gemini via `deepagents`, requires `GEMINI_API_KEY`)

**Memory limits:**
- `worker`: 2GB (FFmpeg for 4 concurrent transcodes)
- `ai-worker`: 2GB (Whisper `base` model needs ~1GB)

**Database:** Neon (serverless Postgres, accessed via HTTP). `docker-compose` does NOT run Postgres locally — Neon is always remote.

---

## 7. API Endpoints

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | No | Create account, returns JWT |
| POST | `/api/auth/login` | No | Login, returns JWT |
| POST | `/api/s3/upload` | Yes | Get pre-signed upload URL |
| GET | `/api/s3/get/:fileId` | Yes | Get pre-signed download URL |
| POST | `/api/s3/process` | Yes | Trigger processing pipeline |

---

## 8. Error Handling & Resilience

- **Exponential backoff retries:** `transcodeQueue` → 5 attempts, delay doubles each time (3s → 6s → 12s → 24s → 48s)
- **DB status tracking:** Every stage updates `*Status` column — UI can poll for progress
- **Failed job retention:** `removeOnFail: false` keeps failed jobs in Redis for inspection
- **File cleanup:** Every worker deletes local temp files immediately after S3 upload to prevent disk exhaustion
- **Idempotency check:** HLS worker checks if `localPath` still exists before processing (handles job retries safely)
- **Uncaught exception handler:** `logger.ts` catches `uncaughtException` and `unhandledRejection` and writes to `logs/log.txt`

---

## 9. Common Interview Questions & Answers

**Q: Why not use AWS Lambda for video processing?**
A: Lambda has a 15-minute timeout and 10GB memory limit. Heavy transcoding (1080p H.264) can exceed both. A persistent worker on ECS is more appropriate for long-running, CPU-intensive jobs.

**Q: Why Redis for metadata and queue?**
A: Redis serves two roles — it's BullMQ's store (job queue state) and a fast ephemeral key-value store for upload metadata. Much faster than querying Postgres for every job pickup.

**Q: What happens if the worker crashes mid-transcode?**
A: BullMQ marks the active job as stalled (after a lock timeout) and re-queues it. The retry mechanism with exponential backoff picks it up again. DB status stays as `processing` until resolved.

**Q: Why segment into HLS instead of just serving .mp4?**
A: HLS allows adaptive bitrate streaming (player switches quality based on bandwidth), enables seeking without full download, and is CDN-friendly due to small cacheable chunks.

**Q: How is OIDC better than static IAM keys in CI/CD?**
A: OIDC tokens are short-lived (minutes). No secret to rotate or leak. GitHub's identity provider signs the token; AWS verifies it and issues temporary credentials via STS AssumeRoleWithWebIdentity.

**Q: Why `Promise.all` for transcoding?**
A: All 4 FFmpeg processes are I/O and CPU bound. Running them concurrently means total time ≈ time of slowest resolution, not sum of all resolutions.

**Q: How does faster-whisper differ from OpenAI Whisper?**
A: faster-whisper uses CTranslate2 (optimized inference engine) instead of PyTorch. With `int8` quantization it uses less memory and runs faster on CPU, making it viable without a GPU.

---

## 10. Key File Map

```
server/
├── src/
│   ├── server.ts          # HTTP server startup
│   ├── worker.ts          # Worker process entry (transcode/hls/thumbnail)
│   ├── ai-worker.ts       # AI worker process entry (transcribe + summary)
│   ├── app.ts             # Express app, routes, CORS
│   ├── config/
│   │   ├── db.ts          # Drizzle + Neon setup
│   │   ├── redis.ts       # ioredis client
│   │   └── s3.ts          # AWS S3 client
│   ├── models/
│   │   ├── user.model.ts  # users table schema
│   │   └── video.model.ts # videos table + all status enums
│   ├── services/
│   │   ├── s3.service.ts        # upload/process API handlers
│   │   ├── transcode.service.ts # download, FFmpeg transcode, S3 upload
│   │   ├── hls.service.ts       # HLS segmentation + S3 upload
│   │   ├── thumbnail.service.ts # frame extraction + S3 upload
│   │   ├── transcribe.service.ts# audio extraction + Whisper + S3 upload
│   │   ├── summary.service.ts   # Gemini AI agent config
│   │   ├── auth.service.ts      # bcrypt hash/compare
│   │   └── user.service.ts      # DB user queries
│   ├── workers/
│   │   ├── transcode.queue.ts   # BullMQ Queue (retry config)
│   │   ├── transcode.worker.ts  # BullMQ Worker (orchestrates pipeline)
│   │   ├── hls.queue.ts / hls.worker.ts
│   │   ├── thumbnail.queue.ts / thumbnail.worker.ts
│   │   ├── transcribe.queue.ts / transcribe.worker.ts
│   │   └── summary.queue.ts / summary.worker.ts
│   ├── utils/
│   │   ├── getPresignedUrl.ts   # S3 pre-signed URL generation
│   │   ├── jwt.ts               # JWT sign/verify
│   │   ├── generateId.ts        # UUID file ID generation
│   │   └── logger.ts            # Console override → log.txt
│   ├── controllers/
│   │   └── auth.controller.ts   # Register/Login handlers
│   ├── middleware/
│   │   └── auth.middleware.ts   # JWT verification middleware
│   └── routes/
│       ├── auth.routes.ts
│       └── s3.routes.ts
├── Dockerfile             # Multi-stage: api / worker / ai-worker
└── docker-compose.yml     # Local dev: redis + api + worker + ai-worker

.github/workflows/
└── build-push-ecr.yml     # CI/CD: build images → ECR → force ECS deploy

web/
└── src/app/               # Next.js App Router frontend
```
