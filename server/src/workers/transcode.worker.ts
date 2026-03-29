import { Worker, type Job } from "bullmq";
import { redis } from "../config/redis.js";
import { downloadObjectFromPreSignedUrl, getPreSignedUrlForDownload, transcodeVideo, uploadTranscodedFiles } from "../services/transcode.service.js";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const transcodeWorker = new Worker("transcodeQueue", async (job: Job) => {
    const { fileId, userId, contentType } = job.data;
    console.log(`📽️ Processing job ${job.id} for fileId ${fileId}`);

    const videoDownloadSignedUrl = await getPreSignedUrlForDownload(fileId, userId);

    if (!videoDownloadSignedUrl) {
        console.log(`❌ Presigned url failed for job ${job.id}.`);
        return;
    }

    const localFilePath = await downloadObjectFromPreSignedUrl(videoDownloadSignedUrl, fileId, job)

    console.log(`⏳ Initiating bulk FFmpeg transcodes for ${fileId}...`);
    const outputFiles = await transcodeVideo(localFilePath, fileId);
    console.log(`✅ All transcoding finished for job ${job.id}. Outputs: ${outputFiles.join(', ')}`)
    console.log(`☁️  Uploading transcoded files to S3 for ${fileId}...`);
    const uploadedKeys = await uploadTranscodedFiles(outputFiles, fileId, userId);
    console.log(`✅ All uploads complete for job ${job.id}. Keys: ${uploadedKeys.join(', ')}`);
}, {
    connection: redis as any,
});

transcodeWorker.on("completed", (job) => {
    exec("rm -rf downloads", (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`stderr: ${stderr}`);
            return;
        }
        console.log('Successfully cleaned up downloads directory');
    })
    console.log(`Job ${job.id} has completed successfully!`);
});

transcodeWorker.on("failed", (job, err) => {
    console.log(`Job ${job?.id} has failed with error: ${err.message}`);
});
