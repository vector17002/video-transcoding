import { Queue } from "bullmq";
import { redis } from "../config/redis.js";

export const hlsQueue = new Queue("hlsQueue", {
    connection: redis as any,
    defaultJobOptions: {
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 5000
        },
        removeOnComplete: true,
        removeOnFail: false
    }
});
