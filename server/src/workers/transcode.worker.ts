import { tryCatch, Worker, type Job } from "bullmq";
import { redis } from "../config/redis.js";
import { downloadObjectFromPreSignedUrl, getPreSignedUrlForDownload, transcodeVideo, uploadTranscodedFiles } from "../services/transcode.service.js";
import path from "path";
import { hlsQueue } from "./hls.queue.js";
import { thumbnailQueue } from "./thumbnail.queue.js";

// ──────────────────────────────────────────────────────────
// 🧪 TEST CONFIG: Simulate failures to observe exponential backoff
// Set to true to make the first N attempts fail on purpose
// const SIMULATE_FAILURE = true;
// const FAIL_UNTIL_ATTEMPT = 3; // Succeed on the 3rd attempt (fails attempts 1 & 2)
const BASE_DELAY = 3000; // Must match the delay in transcode.queue.ts
// ──────────────────────────────────────────────────────────

// Track timestamps to measure actual delay between attempts
// const jobTimestamps = new Map<string, number>();

export const transcodeWorker = new Worker("transcodeQueue", async (job: Job) => {
    const { fileId, userId, contentType } = job.data;
    const currentAttempt = job.attemptsMade + 1; // attemptsMade is 0-indexed before this run

    // const now = Date.now();
    // const jobKey = job.id ?? fileId;
    // const lastTimestamp = jobTimestamps.get(jobKey);
    // const elapsedMs = lastTimestamp ? now - lastTimestamp : 0;
    // jobTimestamps.set(jobKey, now); 

    // const expectedDelay = currentAttempt > 1 ? BASE_DELAY * Math.pow(2, currentAttempt - 2) : 0;

    // console.log(`\n${'='.repeat(60)}`);
    // console.log(`📽️ Processing job ${job.id} | fileId: ${fileId}`);
    // console.log(`🔄 Attempt ${currentAttempt} / ${job.opts.attempts ?? '?'}`);
    // console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    // if (currentAttempt > 1) {
    //     console.log(`⏱️  Time since last attempt: ${(elapsedMs / 1000).toFixed(1)}s (expected: ~${(expectedDelay / 1000).toFixed(1)}s)`);
    // }
    // console.log(`${'='.repeat(60)}`);

    // // 🧪 Simulate failure for testing exponential backoff
    // if (SIMULATE_FAILURE && currentAttempt < FAIL_UNTIL_ATTEMPT) {
    //     const nextDelay = BASE_DELAY * Math.pow(2, currentAttempt - 1);
    //     const errorMsg = `🧪 SIMULATED FAILURE on attempt ${currentAttempt}. Will succeed on attempt ${FAIL_UNTIL_ATTEMPT}. Next retry in ~${(nextDelay / 1000).toFixed(1)}s (exponential backoff).`;
    //     console.log(`❌ ${errorMsg}`);
    //     throw new Error(errorMsg);
    // }

    // if (SIMULATE_FAILURE && currentAttempt >= FAIL_UNTIL_ATTEMPT) {
    //     console.log(`✅ 🧪 Attempt ${currentAttempt} — past simulated failure threshold, proceeding normally!`);
    // }

    const videoDownloadSignedUrl = await getPreSignedUrlForDownload(fileId, userId);

    if (!videoDownloadSignedUrl) {
        console.log(`❌ Presigned url failed for job ${job.id}.`);
        return;
    }

    const localFilePath = await downloadObjectFromPreSignedUrl(videoDownloadSignedUrl, fileId, job)

    // Starting creating thumbnail for the video
    await thumbnailQueue.add("thumbnail", { fileId, userId, localFilePath });
    console.log(`Thumbnail job added for fileId ${fileId} with ${localFilePath} local file`);

    // Starting transcode for the video
    console.log(`⏳ Initiating bulk FFmpeg transcodes for ${fileId}...`);
    const outputFiles = await transcodeVideo(localFilePath, fileId);
    console.log(`✅ All transcoding finished for job ${job.id}.`);

    // Uploading transcoded video
    console.log(`☁️  Uploading transcoded files to S3 for ${fileId}...`);
    await uploadTranscodedFiles(outputFiles, fileId, userId);
    console.log(`✅ All uploads complete for job ${job.id}.`);

    // Build a map of bitrate → local file path for the HLS worker
    // so it can segment directly from disk instead of re-downloading from S3
    const transcodedFiles = outputFiles.map((filePath) => {
        const fileName = path.basename(filePath);
        const bitrate = fileName.replace(`${fileId}_`, '').replace('.mp4', '');
        return { bitrate, localPath: filePath };
    });

    // Starting HLS for the videos of different bitrate
    await hlsQueue.add("hls", { fileId, userId, transcodedFiles });
    console.log(`HLS job added for fileId ${fileId} with ${transcodedFiles.length} local transcoded files`);
}, {
    connection: redis as any,
    settings: {
        backoffStrategy: (attemptsMade: number, type?: string) => {
            if (type === 'exponential') {
                const delay = Math.round(Math.pow(2, attemptsMade - 1) * BASE_DELAY);
                console.log(`\n🔧 Backoff strategy called: attemptsMade=${attemptsMade}, type=${type}`);
                console.log(`   📐 Formula: 2^(${attemptsMade}-1) × ${BASE_DELAY}ms = ${delay}ms (${(delay / 1000).toFixed(1)}s)`);
                return delay;
            }
            return BASE_DELAY;
        },
    },
});

transcodeWorker.on("completed", (job) => {
    console.log(`Job ${job.id} has completed successfully!`);
});

transcodeWorker.on("failed", (job, err) => {
    const attempt = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts.attempts ?? 5;
    const nextDelay = BASE_DELAY * Math.pow(2, attempt - 1);
    console.log(`\n❌ Job ${job?.id} FAILED on attempt ${attempt}/${maxAttempts}`);
    console.log(`   Error: ${err.message}`);
    if (attempt < maxAttempts) {
        console.log(`   ⏳ Next retry in ~${(nextDelay / 1000).toFixed(1)}s (exponential backoff: ${BASE_DELAY / 1000}s × 2^${attempt - 1})`);
    } else {
        console.log(`   🚫 No more retries — job has permanently failed.`);
    }
});
