import { Worker, type Job } from "bullmq";
import { redis } from "../config/redis.js";
import {
    downloadOriginalForTranscription,
    extractAudio,
    runWhisper,
    uploadTranscript,
    cleanupTranscribeFiles,
} from "../services/transcribe.service.js";
import { db } from "../config/db.js";
import { eq } from "drizzle-orm";
import { videoTable } from "../models/video.model.js";

export const transcribeWorker = new Worker("transcribeQueue", async (job: Job) => {
    const { fileId, userId } = job.data as { fileId: string; userId: string };

    console.log(`\n🎙️  Transcription job ${job.id} started for fileId: ${fileId}`);

    // Mark as processing
    await db.update(videoTable).set({
        transcriptStatus: 'processing'
    }).where(eq(videoTable.id, fileId));

    // 1. Download original video from S3
    const videoPath = await downloadOriginalForTranscription(fileId, userId, job.id!);

    // 2. Extract audio (16kHz mono WAV — Whisper's preferred format)
    const audioPath = await extractAudio(videoPath);

    // 3. Run faster-whisper
    console.log(`⏳ Running Whisper on ${audioPath} (model: ${process.env.WHISPER_MODEL ?? 'base'})...`);
    const transcript = await runWhisper(audioPath);
    console.log(`✅ Transcription complete — language: ${transcript.language}, duration: ${transcript.duration}s, segments: ${transcript.segments.length}`);

    // 4. Upload transcript JSON to S3
    const transcriptKey = await uploadTranscript(transcript, fileId, userId);

    // 5. Persist the S3 key in the DB
    await db.update(videoTable).set({
        transcriptKey,
        transcriptStatus: 'completed',
    }).where(eq(videoTable.id, fileId));

    // 6. Clean up local temp files
    cleanupTranscribeFiles(videoPath, audioPath);

}, {
    connection: redis as any,
});

transcribeWorker.on("completed", (job) => {
    console.log(`🎙️  Transcription job ${job.id} completed successfully!`);
});

transcribeWorker.on("failed", async (job, err) => {
    console.error(`❌ Transcription job ${job?.id} failed: ${err.message}`);
    await db.update(videoTable).set({
        transcriptStatus: 'failed',
    }).where(eq(videoTable.id, job?.data.fileId));
});
