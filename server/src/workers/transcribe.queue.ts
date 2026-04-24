import { Queue } from "bullmq";
import { redis } from "../config/redis.js";

export const transcribeQueue = new Queue("transcribeQueue", {
    connection: redis as any,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000
        },
        removeOnComplete: true,
        removeOnFail: false
    }
});
