import { Worker, type Job } from "bullmq";
import { redis } from "../config/redis.js";
import { downloadObjectFromPreSignedUrlWithBitrate, getPreSignedUrlForDownloadHls, segmentVideo, uploadSegmentedVideos } from "../services/hls.service.js";
import { exec } from "child_process";

export const hlsWorker = new Worker("hlsQueue", async (job: Job) => {
    const { fileId, userId } = job.data;
    console.log(`📽️ Processing HLS job ${job.id} for fileId ${fileId}`);

    const videoDownloadSignedUrls = await getPreSignedUrlForDownloadHls(fileId, userId);

    await Promise.all(videoDownloadSignedUrls.map(async (url) => {
        const localFilePath = await downloadObjectFromPreSignedUrlWithBitrate(url.url, fileId, job, url.bitrate);

        console.log(`⏳ Initiating HLS segmenting for ${fileId} for ${url.bitrate} bitrate...`);
        const playlistPath = await segmentVideo(localFilePath, fileId, job, url.bitrate);
        console.log(`✅ HLS playlist created at ${playlistPath}`);


        console.log(`☁️  Uploading segmented files to S3 for ${fileId} with ${url.bitrate} bitrate...`);
        const uploadedKeys = await uploadSegmentedVideos(playlistPath, fileId, userId, url.bitrate);
        console.log(`✅ All hls uploads complete for job ${job.id}. Keys: ${uploadedKeys}`);
    }));

}, {
    connection: redis as any,
});

hlsWorker.on("completed", () => {
    exec("rm -rf hlsDownloads", (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`stderr: ${stderr}`);
            return;
        }
        console.log('Successfully cleaned up hlsDownloads directory');
    })
})

hlsWorker.on("failed", (job, err) => {
    console.log(`Job ${job?.id} has failed with error: ${err.message}`);
})