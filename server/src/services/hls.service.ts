import { getDownloadUrl } from "../utils/getPresignedUrl.js";
import { type Job } from "bullmq";
import axios from "axios";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import ffmpeg from "fluent-ffmpeg";
import s3Client from "../config/s3.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const bitRateFiles = [
    "1080p",
    "720p",
    "480p",
    "360p"
]

export type VideoDownloadSignedUrlsWithBitrates = {
    bitrate: string;
    url: string;
}

export const getPreSignedUrlForDownloadHls = async (fileId: string, userId: string) => {
    const currentEnv = process.env.NODE_ENV === 'development' ? 'dev' : 'prod';
    const baseVideoObjectId = `${currentEnv}/users/${userId}/original/${fileId}`;

    const videoDownloadSignedUrls: VideoDownloadSignedUrlsWithBitrates[] = [];

    await Promise.all(bitRateFiles.map(async (bitRateFile) => {
        const videoObjectId = `${baseVideoObjectId}/${bitRateFile}.mp4`
        const videoDownloadSignedUrl = await getDownloadUrl(videoObjectId)

        if (!videoDownloadSignedUrl) {
            throw new Error(`Video download url is not found for file ${baseVideoObjectId} for bitrate ${bitRateFile}`);
        }

        videoDownloadSignedUrls.push({ bitrate: bitRateFile, url: videoDownloadSignedUrl })
    }))

    return videoDownloadSignedUrls
}

export const downloadObjectFromPreSignedUrlWithBitrate = async (videoDownloadSignedUrl: string, fileId: string, job: Job, bitrate: string) => {
    // Download the video as a buffer
    const response = await axios.get(videoDownloadSignedUrl, { responseType: 'arraybuffer' });

    if (response.status !== 200)
        console.log(`Video download failed for hls job id ${job.id}`)

    const videoBuffer = response.data;

    // Ensure downloads directory exists (hlsDownloads/{fileId}/{bitrate})
    const downloadsDir = path.join(__dirname, '..', '..', 'hlsDownloads', fileId);
    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
    }

    // Save the buffer to the local repository
    const localFilePath = path.join(downloadsDir, `${bitrate}.mp4`);
    fs.writeFileSync(localFilePath, videoBuffer);
    console.log(`✅ Video downloaded successfully to ${localFilePath} for hls job ${job.id}`);

    return localFilePath;
}

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
    const bucket = process.env.HLS_S3_BUCKET_NAME;
    const s3BaseKey = `${currentEnv}/users/${userId}/${fileId}/${bitrate}`;

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
    }));

    console.log(`✅ All HLS files uploaded to S3 for ${fileId} [${bitrate}]`);
    return uploadedKeys;
}
