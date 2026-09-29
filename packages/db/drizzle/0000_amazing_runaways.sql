CREATE TYPE "public"."mailbox_provider" AS ENUM('google', 'microsoft');--> statement-breakpoint
CREATE TYPE "public"."mailbox_status" AS ENUM('active', 'disconnected', 'paused');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."webhook_delivery_status" AS ENUM('pending', 'delivered', 'failed');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mailboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"provider" "mailbox_provider" NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"access_token_enc" text,
	"access_expires_at" timestamp with time zone,
	"daily_limit" integer DEFAULT 400 NOT NULL,
	"sent_today" integer DEFAULT 0 NOT NULL,
	"status" "mailbox_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mailboxes_org_email_uq" UNIQUE("org_id","email")
);
--> statement-breakpoint
ALTER TABLE "mailboxes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_org_user_uq" UNIQUE("org_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"mailbox_id" uuid,
	"idempotency_key" text,
	"to_email" text NOT NULL,
	"from_email" text NOT NULL,
	"subject" text NOT NULL,
	"status" "message_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_org_idempotency_uq" UNIQUE("org_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppressions" (
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppressions_org_id_email_pk" PRIMARY KEY("org_id","email")
);
--> statement-breakpoint
ALTER TABLE "suppressions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_org_slug_uq" UNIQUE("org_id","slug")
);
--> statement-breakpoint
ALTER TABLE "templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"message_id" uuid,
	"event" text NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"response_code" integer,
	"next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_org_id_idx" ON "api_keys" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "audit_log_org_id_idx" ON "audit_log" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "audit_log_org_created_idx" ON "audit_log" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "mailboxes_org_id_idx" ON "mailboxes" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "members_org_id_idx" ON "members" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "messages_org_id_idx" ON "messages" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "messages_org_created_idx" ON "messages" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "messages_status_created_idx" ON "messages" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "templates_org_id_idx" ON "templates" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_org_id_idx" ON "webhook_deliveries" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_status_retry_idx" ON "webhook_deliveries" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_org_id_idx" ON "webhook_endpoints" USING btree ("org_id");--> statement-breakpoint
CREATE POLICY "api_keys_tenant_isolation" ON "api_keys" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on') WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "audit_log_tenant_isolation" ON "audit_log" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on') WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "mailboxes_tenant_isolation" ON "mailboxes" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on') WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "members_tenant_isolation" ON "members" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on') WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "messages_tenant_isolation" ON "messages" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on') WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "suppressions_tenant_isolation" ON "suppressions" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on') WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "templates_tenant_isolation" ON "templates" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on') WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "webhook_deliveries_tenant_isolation" ON "webhook_deliveries" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on') WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "webhook_endpoints_tenant_isolation" ON "webhook_endpoints" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on') WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on');