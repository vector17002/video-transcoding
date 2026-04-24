import { pgEnum, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { userTable } from "./user.model.js";

export const statusEnum = pgEnum('status', ['not-started', 'processing', 'completed', 'failed']);
export const trancodeStatusEnum = pgEnum('transcode_status', ['not-started', 'processing', 'completed', 'failed']);
export const hlsStatusEnum = pgEnum('hls_status', ['not-started', 'processing', 'completed', 'failed']);
export const thumbnailStatusEnum = pgEnum('thumbnail_status', ['not-started', 'processing', 'completed', 'failed']);
export const transciptStatusEnum = pgEnum('transcript_status', ['not-started', 'processing', 'completed', 'failed']);

export const videoTable = pgTable('videoTable', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => userTable.id),
    status: statusEnum().notNull().default('not-started'),
    trancodeStatus: trancodeStatusEnum().notNull().default('not-started'),
    hlsStatus: hlsStatusEnum().notNull().default('not-started'),
    thumbnailStatus: thumbnailStatusEnum().notNull().default('not-started'),
    transcriptStatus: transciptStatusEnum().notNull().default('not-started'),
    transcriptKey: text('transcript_key'),
    originalVideoKey: text('original_video_key'),
    hlsManifestKey: text('hls_manifest_key'),
    thumbnailVideoKey: text('thumbnail_video_key'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
})

