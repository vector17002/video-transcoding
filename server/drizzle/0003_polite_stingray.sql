CREATE TYPE "public"."summary_status" AS ENUM('not-started', 'processing', 'completed', 'failed');--> statement-breakpoint
ALTER TABLE "videoTable" ADD COLUMN "summary_key" text;--> statement-breakpoint
ALTER TABLE "videoTable" ADD COLUMN "summaryStatus" "summary_status" DEFAULT 'not-started' NOT NULL;