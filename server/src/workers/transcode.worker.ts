import { Worker, type Job } from "bullmq";
import { redis } from "../config/redis.js";

export const transcodeWorker = new Worker("transcodeQueue", async (job: Job) => {
    const { fileId, userId, contentType } = job.data;
    console.log(`📽️ Processing job ${job.id} for fileId ${fileId}`);

    // Simulate transcoding delay
    await new Promise((resolve) => setTimeout(resolve, 3000));

    console.log(`✅ Transcoding completed for job ${job.id}`);

    // TODO: 
    // 1. Download original file from S3
    // 2. Transcode with fluent-ffmpeg to 720p, 360p, 240p
    // 3. Upload transcoded versions back to S3
}, {
    connection: redis as any,
});

transcodeWorker.on("completed", (job) => {
    console.log(`Job ${job.id} has completed successfully!`);
});

transcodeWorker.on("failed", (job, err) => {
    console.log(`Job ${job?.id} has failed with error: ${err.message}`);
});
