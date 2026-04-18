import { type Request, type Response } from "express";
import { getDownloadUrl, getUploadUrl } from "../utils/getPresignedUrl.js";
import { verifyToken } from "../utils/jwt.js";
import type { JwtPayload } from "jsonwebtoken";
import { redis } from "../config/redis.js";
import { transcodeQueue } from "../workers/transcode.queue.js";
import { db } from "../config/db.js";
import { videoTable } from "../models/video.model.js";
import { eq } from 'drizzle-orm'

export const s3UploadService = async (req: Request, res: Response) => {
    try {
        const { contentType } = req.body
        let token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            token = req.headers.cookie?.split("token=")[1]?.split(";")[0];
        }
        const user = verifyToken(token || '') as JwtPayload;

        const { url, fileId } = await getUploadUrl({ userId: String(user.userId || ''), contentType });

        const env = process.env.NODE_ENV === 'development' ? 'dev' : 'prod'
        await db.insert(videoTable).values({
            id: fileId,
            userId: user.userId,
            originalVideoKey: `${env}/users/${user.userId}/${fileId}/original`
        })

        //Setting the fileId and metadata in redis so that queue can start working on it.
        // We can also use videoQueue and add job with the metadata have to check for its optimalism!!!!
        await redis.set(fileId, JSON.stringify({ userId: user.userId, contentType }))
        res.status(200).json({ url, fileId })
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: "Internal Server Error" })
    }
}

export const s3GetService = async (req: Request, res: Response) => {
    try {
        const params = req.params

        const fileId = params.fileId

        const url = await getDownloadUrl(fileId as string)
        res.status(200).json({ url })
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: "Internal Server Error" })
    }
}

export const s3ProcessService = async (req: Request, res: Response): Promise<void> => {
    try {
        const { fileId } = req.body;
        if (!fileId) {
            res.status(400).json({ message: "fileId is required" });
            return;
        }

        const metadataStr = await redis.get(fileId);
        if (!metadataStr) {
            res.status(404).json({ message: "File metadata not found" });
            return;
        }

        const metadata = JSON.parse(metadataStr);
        await db.update(videoTable).set({
            status: 'processing'
        }).where(eq(videoTable.id, fileId))

        // Enqueue the job for transcoding
        await transcodeQueue.add("transcodeJob", { fileId, ...metadata });
        res.status(200).json({ message: "Processing started successfully", fileId });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}