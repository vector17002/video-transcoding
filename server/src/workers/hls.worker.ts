import { Worker, type Job } from "bullmq";
import { redis } from "../config/redis.js";
import { segmentVideo, uploadSegmentedVideos } from "../services/hls.service.js";
import fs from "fs";
import path from "path";
import { db } from "../config/db.js";
import { eq } from "drizzle-orm";
import { videoTable } from "../models/video.model.js";

interface TranscodedFile {
    bitrate: string;
    localPath: string;
}

export const hlsWorker = new Worker("hlsQueue", async (job: Job) => {
    const { fileId, userId, transcodedFiles } = job.data as {
        fileId: string;
        userId: string;
        transcodedFiles: TranscodedFile[];
    };

    console.log(`📽️ Processing HLS job ${job.id} for fileId ${fileId}`);
    console.log(`📂 Using ${transcodedFiles.length} locally transcoded files (no S3 re-download needed)`);

    await Promise.all(transcodedFiles.map(async ({ bitrate, localPath }) => {
        // Check if the mp4 has already been deleted (to handle job retries idempotently)
        if (!fs.existsSync(localPath)) {
            console.log(`⏭️  Skipping previously completed HLS task for ${fileId} [${bitrate}] (transcoded source deleted)`);
            return;
        }

        console.log(`⏳ Initiating HLS segmenting for ${fileId} [${bitrate}]...`);
        const playlistPath = await segmentVideo(localPath, fileId, job, bitrate);
        console.log(`✅ HLS playlist created for [${bitrate}]`);

        console.log(`☁️  Uploading segmented files to S3 for ${fileId} [${bitrate}]...`);
        await uploadSegmentedVideos(playlistPath, fileId, userId, bitrate);
        console.log(`✅ All HLS uploads complete for job ${job.id} [${bitrate}].`);

        // Delete the transcoded source file ONLY after successful S3 upload
        if (fs.existsSync(localPath)) {
            fs.unlinkSync(localPath);
            console.log(`🗑️  Deleted transcoded source: ${localPath}`);
        }
    }));

    // Clean up parent directories if empty
    const downloadsDir = path.dirname(transcodedFiles[0]?.localPath ?? '');
    if (downloadsDir && fs.existsSync(downloadsDir)) {
        const remaining = fs.readdirSync(downloadsDir);
        if (remaining.length === 0) {
            fs.rmSync(downloadsDir, { recursive: true });
            console.log(`🗑️  Removed empty downloads directory: ${downloadsDir}`);
        }
    }

}, {
    connection: redis as any,
});

hlsWorker.on("completed", async (job) => {
    await db.update(videoTable).set({
        hlsStatus: 'completed'
    }).where(eq(videoTable.id, job.data.fileId))
    console.log(`HLS Job ${job?.id} has completed successfully!`);
});

hlsWorker.on("failed", async (job, err) => {
    await db.update(videoTable).set({
        hlsStatus: 'failed',
        status: 'failed'
    }).where(eq(videoTable.id, job?.data.fileId))
    console.log(`HLS Job ${job?.id} has failed with error: ${err.message}`);
});