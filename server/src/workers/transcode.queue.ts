import { Queue } from "bullmq";
import { redis } from "../config/redis.js";

export const transcodeQueue = new Queue("transcodeQueue", {
    connection: redis as any
});
