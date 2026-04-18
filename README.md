# Video Thumbnail Processing POC

## Overview
This project is a Proof of Concept (POC) for a robust video processing pipeline. It allows users to authenticate, upload videos directly to AWS S3 using pre-signed URLs, and triggers asynchronous backend workers to transcode the video, generate HLS (HTTP Live Streaming) streams, and extract thumbnails. 

This README is designed to provide context for AI assistants or human developers to quickly understand the architecture, maintain, and expand the project.

## Technology Stack
- **Frontend**: Vanilla HTML/CSS/JS (lightweight, single file SPA)
- **Backend API**: Node.js, Express.js (v5)
- **Database**: PostgreSQL (provided locally via Neon Docker image)
- **ORM**: Drizzle ORM
- **Task Queue**: Redis + BullMQ
- **Video Processing**: FFmpeg (via `fluent-ffmpeg` wrapper)
- **Storage**: AWS S3
- **Containerization**: Docker & Docker Compose

## Architecture & Data Flow
1. **Authentication**: 
   - Users register/login via `/api/auth` endpoints.
   - The backend issues a JWT, stored client-side (cookies/localStorage) for subsequent requests.
2. **S3 Direct Upload**: 
   - Frontend calls `/api/s3/upload` to request a secure pre-signed URL.
   - A direct `PUT` request is made from the browser to S3, eliminating the need to proxy massive video files through the Node.js server.
3. **Trigger Processing**: 
   - Once the S3 upload finishes, the frontend signals the backend via `/api/s3/process` (passing the `fileId`).
4. **Background Workers (BullMQ)**: 
   - The `/api/s3/process` endpoint enqueues jobs onto Redis.
   - Separate worker processes pick up these jobs to execute heavy FFmpeg commands asynchronously.
   - **Transcode Worker**: Processes/compresses the original video.
   - **HLS Worker**: Converts the video into partitioned HLS streams for adaptive bitrate streaming.
   - **Thumbnail Worker**: Extracts static thumbnails.

## Directory Structure
```text
videoThumbnailProcessingPOC/
├── web/
│   └── index.html        # Frontend UI containing auth, drag-drop upload, and S3 logic.
├── server/
│   ├── src/
│   │   ├── app.ts        # Express app middleware and router mounting.
│   │   ├── server.ts     # Main API server entrypoint.
│   │   ├── worker.ts     # Standalone entrypoint for BullMQ workers.
│   │   ├── routes/       # API route definitions (auth, s3).
│   │   ├── controllers/  # API route action handlers.
│   │   ├── middleware/   # Express middlewares (e.g., JWT auth verification).
│   │   ├── models/       # Drizzle ORM schema definitions.
│   │   ├── services/     # Business logic, notably S3 integration.
│   │   └── workers/      # Queue and Worker definitions (transcode, hls, thumbnail).
│   ├── drizzle/          # Database migrations.
│   ├── Dockerfile        # Multi-stage Dockerfile building both `api` and `worker` targets.
│   ├── package.json      # Dependencies and scripts (drizzle-kit, build, dev).
│   └── .env.example      # Template for required environment variables.
└── docker-compose.yml    # Infrastructure orchestrator (Redis, Neon Postgres, API, Worker).
```

## Local Development Setup

1. **Environment Variables**:
   Navigate to the `server` directory, copy the example environment file, and fill in your AWS credentials and PostgreSQL URI:
   ```bash
   cd server
   cp .env.example .env
   # Edit .env with your AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET_NAME etc.
   ```

2. **Docker Compose**:
   From the root of the project, spin up the entire infrastructure:
   ```bash
   docker-compose up --build
   ```
   This command starts:
   - `redis`: Used by BullMQ.
   - `neon-local`: Local Neon PostgreSQL instance.
   - `api`: Node server running on port 8080.
   - `worker`: Node process dedicated strictly to processing the BullMQ video queues.

3. **Database Push (if running locally natively)**:
   ```bash
   cd server
   npm install
   npm run db:push
   ```

4. **Accessing the UI**:
   Since the frontend is a plain HTML file, you can just open `web/index.html` in your web browser. (e.g. using VSCode Live Server).

## AI Assistant Guide for Maintenance & Expansion
If you are an AI attempting to update or debug this repository, keep the following principles in mind:

- **Adding New Features to Upload Flow**:
  - The upload bypasses the server body parsers for efficiency. Any metadata should be saved in the database before generating the pre-signed URL or during the `/api/s3/process` callback.
  
- **Expanding the Worker System**:
  - To add a new background task (e.g., video transcription or watermark injection), create a new queue and worker pair in `server/src/workers/`. 
  - Be sure to instantiate and attach the new worker in `server/src/worker.ts` so the `worker` Docker container actually listens to the queue.
  - Workers use `fluent-ffmpeg`. Ensure the worker environment always has FFmpeg installed (handled automatically in the current `Dockerfile`).

- **Database Tweaks**:
  - Modify `server/src/models/*.ts`.
  - Use `npm run db:generate` followed by `npm run db:migrate` or `npm run db:push` to apply changes.
  
- **Frontend Refactoring**:
  - Currently `web/index.html` is sufficient for a POC. If extending authentication to include OAuth or adding a video gallery, consider proposing a migration to a framework (like React or Vue) to handle state better.
  
- **Monitoring & Scale constraints**:
  - `docker-compose.yml` limits the worker container to 2GB of memory. High-resolution transcoding may require increasing this allocation.
