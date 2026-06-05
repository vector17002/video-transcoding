# Video Thumbnail Processing POC - Project Instructions

## Project Overview
This repository contains a Proof of Concept (POC) for a video processing pipeline. It enables users to upload videos directly to AWS S3 and triggers asynchronous background tasks for transcoding, HLS stream generation, and thumbnail extraction.

## Core Technologies
- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS 4.
- **Backend**: Node.js (Express 5).
- **Database**: PostgreSQL (Neon) with Drizzle ORM.
- **Task Queue**: BullMQ with Redis.
- **Video Processing**: FFmpeg (via `fluent-ffmpeg`).
- **Storage**: AWS S3.
- **Containerization**: Docker & Docker Compose.

## Architecture
1. **Direct S3 Upload**: The frontend requests a pre-signed URL from the backend and uploads the file directly to S3 to avoid server bottlenecks.
2. **Async Processing**: After upload, the backend enqueues jobs in BullMQ.
3. **Decoupled Workers**: A separate worker process (`server/src/worker.ts`) handles the heavy lifting of video processing.

## Development Workflows

### Infrastructure
Use `docker-compose up` to start Redis and local Neon Postgres.

### Backend Development
- Located in `/server`.
- Uses ES Modules. **Always use `.js` extensions in relative imports** (e.g., `import { x } from './utils.js'`) as per `module: nodenext`.
- Use `npm run db:generate` and `npm run db:push` for database schema updates.
- Main entry points: `src/server.ts` (API), `src/worker.ts` (BullMQ Workers), and `src/ai-worker.ts` (transcription & summarization BullMQ Workers).

### Frontend Development
- Located in `/web`.
- Uses Next.js App Router.
- Tailwind CSS 4 for styling.

## Coding Conventions

### Backend (Express)
- Use **Zod** for request validation.
- Use **Drizzle ORM** for database interactions.
- Business logic should reside in `src/services/`.
- Heavy/Long-running tasks MUST be handled via `src/workers/`.
- Maintain ESM compliance (explicit `.js` extensions in imports).
- **Logging**: The project uses a custom logging system in `src/utils/logger.ts` that overrides global `console` methods and writes to `server/logs/log.txt`. Use standard `console.log`, `console.error`, etc., for logging.

### Frontend (Next.js)
- Use functional components and hooks.
- Prefer Tailwind utility classes for styling.
- API calls should be centralized in `src/lib/api.ts`.
- Components are located in `src/app/components/`.

## Security & Safety
- **NEVER** commit the `.env` file.
- All AWS and Database credentials must be managed via environment variables.
- Ensure S3 buckets are configured with appropriate CORS policies (see `server/scripts/setup-s3-cors.ts`).

## Key File Locations
- `server/src/models/`: Database schemas.
- `server/src/services/`: Core business logic (including LLM summarization and transcription services).
- `server/src/workers/`: BullMQ queue and worker definitions (transcode, HLS, thumbnail, transcription, and summarization).
- `web/src/app/components/`: Reusable UI components.
- `web/src/lib/api.ts`: Frontend API client.
