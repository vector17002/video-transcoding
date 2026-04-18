import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import s3Client from "../config/s3.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { generateId } from "../utils/generateId.js";

const BUCKET = process.env.S3_BUCKET_NAME;
const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

export const getUploadUrl = async ({ userId, contentType }: { userId: string, contentType: string }) => {
    const fileId = generateId();
    const key = `${environment}/users/${userId}/${fileId}/original`;

    const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType || "application/octet-stream" });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 600 * 5 });
    return { url, fileId };
}

export const getDownloadUrl = async (fileId: string) => {
    const key = `${fileId}`;

    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 600 * 5 });
    return url;
}