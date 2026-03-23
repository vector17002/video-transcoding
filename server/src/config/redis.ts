import { Redis } from "ioredis"

const ioRedisUrl = process.env.IOREDIS_URL
const client = new Redis(ioRedisUrl || '', {
    maxRetriesPerRequest: null
});

export const redis = client;