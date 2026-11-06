CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"tat" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_runs" (
	"name" text PRIMARY KEY NOT NULL,
	"period" text NOT NULL,
	"claimed_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "rate_limits_tat_idx" ON "rate_limits" USING btree ("tat");--> statement-breakpoint
CREATE INDEX "auth_challenges_expires_idx" ON "auth_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_created_idx" ON "webhook_deliveries" USING btree ("created_at");