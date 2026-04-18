CREATE TYPE "public"."hls_status" AS ENUM('not-started', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('not-started', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."thumbnail_status" AS ENUM('not-started', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."transcode_status" AS ENUM('not-started', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."transcript_status" AS ENUM('not-started', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "userTable" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "videoTable" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" "status" DEFAULT 'not-started' NOT NULL,
	"trancodeStatus" "transcode_status" DEFAULT 'not-started' NOT NULL,
	"hlsStatus" "hls_status" DEFAULT 'not-started' NOT NULL,
	"thumbnailStatus" "thumbnail_status" DEFAULT 'not-started' NOT NULL,
	"transcriptStatus" "transcript_status" DEFAULT 'not-started' NOT NULL,
	"original_video_key" text,
	"hls_manifest_key" text,
	"thumbnail_video_key" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
