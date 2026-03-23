import { type Request, type Response } from "express";
import { getDownloadUrl, getUploadUrl } from "../utils/getPresignedUrl.js";
import { verifyToken } from "../utils/jwt.js";
import type { JwtPayload } from "jsonwebtoken";
import { redis } from "../config/redis.js";
import { transcodeQueue } from "../workers/transcode.queue.js";

export const s3UploadService = async (req: Request, res: Response) => {
    try {
        const { contentType } = req.body
        let token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            token = req.headers.cookie?.split("token=")[1]?.split(";")[0];
        }
        const user = verifyToken(token || '') as JwtPayload;

        const { url, fileId } = await getUploadUrl({ userId: String(user.userId || ''), contentType });
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

        // Enqueue the job for transcoding
        await transcodeQueue.add("transcodeJob", { fileId, ...metadata });

        res.status(200).json({ message: "Processing started successfully", fileId });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}