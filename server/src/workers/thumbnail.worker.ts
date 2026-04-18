import { Worker, type Job } from "bullmq";
import { redis } from "../config/redis.js";
import { generateThumbnails, setDefaultThumbnail, uploadVideoThumbnails } from "../services/thumbnail.service.js";
import { db } from "../config/db.js";
import { videoTable } from "../models/video.model.js";
import { eq } from "drizzle-orm";

export const thumbnailWorker = new Worker("thumbnailQueue", async (job: Job) => {
    const { fileId, userId, localFilePath } = job.data as
        { fileId: string, userId: string, localFilePath: string };

    console.log(localFilePath)
    const filePathArray = localFilePath.split('/');
    const filePath = filePathArray.slice(0, filePathArray.length - 1).join('/');
    const thumbnailPath = `${filePath}/thumbmnail/${fileId}`;

    console.log(thumbnailPath)

    // Generate the thumbnails in downloads/fileId/
    console.log(`Generating thumbnails for fileId ${fileId}...`)
    await generateThumbnails(localFilePath, thumbnailPath);
    console.log(`Thumbnails generated for file ${fileId}...`)

    console.log(`Generating default thumbnail for fileId ${fileId}`)
    await setDefaultThumbnail(thumbnailPath)
    console.log(`Default thumbnail generated for fileId ${fileId}`)


    await uploadVideoThumbnails(thumbnailPath, fileId, userId);

}, {
    connection: redis as any,
});

thumbnailWorker.on("completed", async (job) => {
    await db.update(videoTable).set({
        thumbnailStatus: 'completed'
    }).where(eq(videoTable.id, job.data.fileId));
    console.log(`Thumbnail Job ${job?.id} has completed successfully!`);
});

thumbnailWorker.on("failed", async (job, err) => {
    await db.update(videoTable).set({
        thumbnailStatus: 'failed'
    }).where(eq(videoTable.id, job?.data.fileId));
    console.log(`Thumbnail Job ${job?.id} has failed with error: ${err.message}`);
});

