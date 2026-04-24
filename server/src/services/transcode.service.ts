import { getDownloadUrl } from "../utils/getPresignedUrl.js";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ffmpeg from "fluent-ffmpeg";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import s3Client from "../config/s3.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getPreSignedUrlForDownload = async (fileId: string, userId: string) => {
    const currentEnv = process.env.NODE_ENV === 'development' ? 'dev' : 'prod';
    const videoObjectId = `${currentEnv}/users/${userId}/${fileId}/original`;

    const videoDownloadSignedUrl = await getDownloadUrl(videoObjectId)

    if (!videoDownloadSignedUrl) {
        throw new Error("Video download signed url not found for transcode job");
    }

    return videoDownloadSignedUrl
}

export const downloadObjectFromPreSignedUrl = async (videoDownloadSignedUrl: string, fileId: string, jobId: string) => {
    // Download the video as a buffer
    const response = await axios.get(videoDownloadSignedUrl, { responseType: 'arraybuffer' });

    if (response.status !== 200)
        console.log(`Video download failed for transcode job id ${jobId}`)

    const videoBuffer = response.data;

    // Ensure downloads directory exists
    const downloadsDir = path.join(__dirname, '..', '..', 'downloads');
    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
    }

    // Save the buffer to the local repository
    const localFilePath = path.join(downloadsDir, fileId);
    fs.writeFileSync(localFilePath, videoBuffer);
    console.log(`✅ Video downloaded successfully to ${localFilePath} for transcode job ${jobId}`);

    return localFilePath;
}

export const transcodeVideo = async (inputFilePath: string, fileId: string): Promise<string[]> => {
    const resolutions = [
        { name: '1080p', size: '1920x1080' },
        { name: '720p', size: '1280x720' },
        { name: '480p', size: '854x480' },
        { name: '360p', size: '640x360' }
    ];

    const downloadsDir = path.dirname(inputFilePath);
    const outputFiles: string[] = [];

    const transcodePromises = resolutions.map((res) => {
        return new Promise<string>((resolve, reject) => {
            const outputFileName = `${fileId}_${res.name}.mp4`;
            const outputFilePath = path.join(downloadsDir, outputFileName);

            console.log(`⏳ Starting transcode for ${res.name} (${res.size})...`);

            ffmpeg(inputFilePath)
                .output(outputFilePath)
                .size(res.size)
                .videoCodec('libx264')
                .audioCodec('aac')
                .on('end', () => {
                    console.log(`✅ Finished transcode for ${res.name}`);
                    outputFiles.push(outputFilePath);
                    resolve(outputFilePath);
                })
                .on('error', (err) => {
                    console.error(`❌ Error transcoding to ${res.name}:`, err);
                    reject(err);
                })
                .run();
        });
    });

    await Promise.all(transcodePromises);

    // Delete the original downloaded file — transcoded copies exist on disk now
    if (fs.existsSync(inputFilePath)) {
        fs.unlinkSync(inputFilePath);
        console.log(`🗑️  Deleted original download: ${inputFilePath}`);
    }

    return outputFiles;
};

export const uploadTranscodedFiles = async (outputFiles: string[], fileId: string, userId: string): Promise<string[]> => {
    const currentEnv = process.env.NODE_ENV === 'development' ? 'dev' : 'prod';
    const bucket = process.env.S3_BUCKET_NAME;
    const uploadedKeys: string[] = [];

    const uploadPromises = outputFiles.map(async (filePath) => {
        const fileName = path.basename(filePath);
        // Extract resolution from filename (e.g. "fileId_720p.mp4" -> "720p")
        const resolution = fileName.replace(`${fileId}_`, '').replace('.mp4', '');
        const s3Key = `${currentEnv}/users/${userId}/${fileId}/resolutions/${resolution}.mp4`;

        const fileBuffer = fs.readFileSync(filePath);

        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: s3Key,
            Body: fileBuffer,
            ContentType: 'video/mp4',
        });

        await s3Client.send(command);
        console.log(`☁️  Uploaded ${resolution} to S3: ${s3Key}`);
        uploadedKeys.push(s3Key);
    });

    await Promise.all(uploadPromises);
    console.log(`✅ All transcoded files uploaded to S3 for fileId: ${fileId}`);
    return uploadedKeys;
};
