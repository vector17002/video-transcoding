import { Queue } from "bullmq";
import { redis } from "../config/redis.js";

export const transcodeQueue = new Queue("transcodeQueue", {
    connection: redis as any,
    defaultJobOptions: {
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 3000
        },
        removeOnComplete: true,
        removeOnFail: false
    }
});
