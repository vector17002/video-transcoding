import { Queue } from "bullmq";
import { redis } from "../config/redis.js";

export const hlsQueue = new Queue("hlsQueue", {
    connection: redis as any
});
