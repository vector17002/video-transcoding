import { Worker, type Job } from "bullmq";
import { redis } from "../config/redis.js";
import { generateThumbnails, setDefaultThumbnail, uploadVideoThumbnails } from "../services/thumbnail.service.js";

export const thumbnailWorker = new Worker("thumbnailQueue", async (job: Job) => {
    const { fileId, userId, localFilePath } = job.data as
        { fileId: string, userId: string, localFilePath: string };

    console.log(localFilePath)
    const filePathArray = localFilePath.split('/');
    const fileName = filePathArray[filePathArray.length - 1] as string;
    const fileNameWithoutExtension = fileName.split('.')[0];
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

thumbnailWorker.on("completed", (job) => {
    console.log(`Thumbnail Job ${job?.id} has completed successfully!`);
});

thumbnailWorker.on("failed", (job, err) => {
    console.log(`Thumbnail Job ${job?.id} has failed with error: ${err.message}`);
});

