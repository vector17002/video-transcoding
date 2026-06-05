import { Job, Worker } from "bullmq";
import { summaryService } from "../services/summary.service.js";
import { db } from "../config/db.js";
import { videoTable } from "../models/video.model.js";
import { eq } from "drizzle-orm";
import { redis } from "../config/redis.js";

export const summaryWorker = new Worker('summary', async (job: Job) => {
    const { transcript, fileId, userId } = job.data as { transcript: string, fileId: string, userId: string };
    console.log('Started summarising......... for', fileId)
    const result = await summaryService(transcript);
    const summary = result.messages[1]?.content as string

    await db.update(videoTable).set({
        summary: summary
    }).where(eq(videoTable.id, fileId))
}, {
    connection: redis as any
})

summaryWorker.on('completed', async (job: Job) => {
    const { fileId } = job.data as { transcript: string, fileId: string, userId: string };
    await db.update(videoTable).set({
        summaryStatus: 'completed'
    }).where(eq(videoTable.id, fileId));
})

summaryWorker.on("failed", async (job, err) => {
    const { fileId } = job?.data
    await db.update(videoTable).set({
        summaryStatus: 'failed',
    }).where(eq(videoTable.id, fileId));
})     