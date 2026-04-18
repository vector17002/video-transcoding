import { type Job } from "bullmq";
import path from "path";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import s3Client from "../config/s3.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";

export const segmentVideo = async (localFilePath: string, fileId: string, job: Job, bitrate: string): Promise<string> => {
    // Output directory: hlsDownloads/{fileId}/{bitrate}/
    const outputDir = path.join(path.dirname(localFilePath), bitrate);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const playlistPath = path.join(outputDir, `${bitrate}.m3u8`);
    const segmentPattern = path.join(outputDir, `segment_%03d.ts`);

    return new Promise<string>((resolve, reject) => {
        console.log(`⏳ Starting HLS segmentation for ${fileId} [${bitrate}]...`);

        ffmpeg(localFilePath)
            .outputOptions([
                '-y',                     // overwrite existing files
                '-codec copy',            // no re-encoding, just repackage
                '-start_number 0',
                '-hls_time 6',           // 10-second segments
                '-hls_list_size 0',       // keep all segments in the playlist
                '-hls_segment_filename', segmentPattern,
                '-f hls',
            ])
            .output(playlistPath)
            .on('progress', (progress) => {
                if (progress.percent) {
                    console.log(`📊 HLS [${bitrate}] progress: ${Math.round(progress.percent)}%`);
                }
            })
            .on('end', () => {
                console.log(`✅ HLS segmentation complete for ${fileId} [${bitrate}] → ${playlistPath}`);
                resolve(playlistPath);
            })
            .on('error', (err) => {
                console.error(`❌ HLS segmentation failed for ${fileId} [${bitrate}]:`, err);
                reject(err);
            })
            .run();
    });
}

export const uploadSegmentedVideos = async (playlistPath: string, fileId: string, userId: string, bitrate: string): Promise<string[]> => {
    const currentEnv = process.env.NODE_ENV === 'development' ? 'dev' : 'prod';
    const bucket = process.env.S3_BUCKET_NAME;
    const s3BaseKey = `${currentEnv}/users/${userId}/${fileId}/hls/${bitrate}`;

    // The playlist lives in the segment output directory — read all files from there
    const segmentDir = path.dirname(playlistPath);
    const files = fs.readdirSync(segmentDir);
    const uploadedKeys: string[] = [];

    await Promise.all(files.map(async (fileName) => {
        const filePath = path.join(segmentDir, fileName);
        const s3Key = `${s3BaseKey}/${fileName}`;
        const contentType = fileName.endsWith('.m3u8')
            ? 'application/x-mpegURL'
            : 'video/MP2T'; // .ts segments

        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: s3Key,
            Body: fs.createReadStream(filePath),
            ContentType: contentType,
        });

        await s3Client.send(command);
        console.log(`☁️  Uploaded ${fileName} to S3: ${s3Key}`);
        uploadedKeys.push(s3Key);

        // Delete the file from disk right after upload
        fs.unlinkSync(filePath);
        console.log(`🗑️  Deleted local file: ${filePath}`);
    }));

    // Remove the now-empty segment directory
    if (fs.existsSync(segmentDir)) {
        fs.rmSync(segmentDir, { recursive: true });
        console.log(`🗑️  Removed segment directory: ${segmentDir}`);
    }

    console.log(`✅ All HLS files uploaded & cleaned up for ${fileId} [${bitrate}]`);
    return uploadedKeys;
}
