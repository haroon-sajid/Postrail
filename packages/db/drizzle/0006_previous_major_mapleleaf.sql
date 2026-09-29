ALTER TYPE "public"."webhook_delivery_status" ADD VALUE 'sending' BEFORE 'delivered';--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "payload" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "error" text;--> statement-breakpoint
CREATE INDEX "webhook_deliveries_endpoint_created_idx" ON "webhook_deliveries" USING btree ("endpoint_id","created_at" DESC NULLS LAST);