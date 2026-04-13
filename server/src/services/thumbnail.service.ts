import { PutObjectCommand } from "@aws-sdk/client-s3";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import s3Client from "../config/s3.js";

export const generateThumbnails = (inputPath: string, outputDir: string) => {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .outputOptions([
                "-vf fps=1/5", // 1 frame every 10 seconds
            ])
            .output(`${outputDir}/thumb_%03d.jpg`)
            .on("end", resolve)
            .on("error", reject)
            .run();
    });
};

export const setDefaultThumbnail = async (inputDir: string) => {

    const defaultSource = path.join(inputDir, "thumb_001.jpg");
    const defaultDest = path.join(inputDir, "default.jpg");

    if (fs.existsSync(defaultSource)) {
        fs.copyFileSync(defaultSource, defaultDest);
    }
};

export const uploadVideoThumbnails = async (thumbnailPath: string, fileId: string, userId: string) => {
    const currentEnv = process.env.NODE_ENV === 'development' ? 'dev' : 'prod';
    const bucket = process.env.S3_BUCKET_NAME;
    const s3BaseKey = `${currentEnv}/users/${userId}/${fileId}/thumbnails`;

    // The thumbnails lives in the thumbnail output directory — read all files from there
    const thumbnailDir = path.dirname(thumbnailPath);
    const fileThumbnailDir = path.join(thumbnailDir, fileId);
    const files = fs.readdirSync(fileThumbnailDir);

    console.log(files)

    await Promise.all(files.map(async (fileName) => {
        const filePath = path.join(fileThumbnailDir, fileName);
        const s3Key = `${s3BaseKey}/${fileName}`;
        const contentType = 'image/jpg'

        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: s3Key,
            Body: fs.createReadStream(filePath),
            ContentType: contentType,
        });

        await s3Client.send(command);
        console.log(`☁️  Uploaded thumbnails for ${fileName} to S3: ${s3Key}`);

        // Delete the file from disk right after upload
        fs.unlinkSync(filePath);
        console.log(`🗑️  Deleted local file: ${filePath}`);
    }));

    // Remove the now-empty segment directory
    if (fs.existsSync(thumbnailDir)) {
        fs.rmSync(thumbnailDir, { recursive: true });
        console.log(`🗑️  Removed thumbnail directory: ${thumbnailDir}`);
    }

    console.log(`✅ All thumbnail files uploaded & cleaned up for ${fileId}]`);
}