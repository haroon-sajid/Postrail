CREATE TYPE "public"."broadcast_recipient_state" AS ENUM('pending', 'dispatching', 'queued', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."broadcast_status" AS ENUM('draft', 'sending', 'sent', 'canceled');--> statement-breakpoint
ALTER TYPE "public"."auth_provider" ADD VALUE 'github';--> statement-breakpoint
CREATE TABLE "auth_signing_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"public_jwk" jsonb NOT NULL,
	"private_key_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_signing_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "broadcast_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"broadcast_id" uuid NOT NULL,
	"contact_id" uuid,
	"email" text NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state" "broadcast_recipient_state" DEFAULT 'pending' NOT NULL,
	"message_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_recipients_broadcast_email_uq" UNIQUE("broadcast_id","email")
);
--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "broadcast_status" DEFAULT 'draft' NOT NULL,
	"template_id" uuid,
	"list_id" uuid,
	"subject" text,
	"html" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "broadcasts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contact_list_members" (
	"org_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_list_members_org_id_list_id_contact_id_pk" PRIMARY KEY("org_id","list_id","contact_id")
);
--> statement-breakpoint
ALTER TABLE "contact_list_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contact_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_lists_org_name_uq" UNIQUE("org_id","name")
);
--> statement-breakpoint
ALTER TABLE "contact_lists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_org_email_uq" UNIQUE("org_id","email")
);
--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD COLUMN "provider" "auth_provider";--> statement-breakpoint
ALTER TABLE "auth_settings" ADD COLUMN "github_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_settings" ADD COLUMN "github_client_id" text;--> statement-breakpoint
ALTER TABLE "auth_settings" ADD COLUMN "github_client_secret_enc" text;--> statement-breakpoint
ALTER TABLE "auth_settings" ADD COLUMN "signups_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_settings" ADD COLUMN "magic_link_template" text;--> statement-breakpoint
ALTER TABLE "auth_settings" ADD COLUMN "otp_template" text;--> statement-breakpoint
ALTER TABLE "message_bodies" ADD COLUMN "sensitive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_signing_keys" ADD CONSTRAINT "auth_signing_keys_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_broadcast_id_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_list_id_contact_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."contact_lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_list_members" ADD CONSTRAINT "contact_list_members_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_list_members" ADD CONSTRAINT "contact_list_members_list_id_contact_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."contact_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_list_members" ADD CONSTRAINT "contact_list_members_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_lists" ADD CONSTRAINT "contact_lists_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_signing_keys_org_created_idx" ON "auth_signing_keys" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "broadcast_recipients_org_broadcast_state_idx" ON "broadcast_recipients" USING btree ("org_id","broadcast_id","state");--> statement-breakpoint
CREATE INDEX "broadcasts_org_created_idx" ON "broadcasts" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "broadcasts_status_idx" ON "broadcasts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "contact_list_members_org_contact_idx" ON "contact_list_members" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "contact_lists_org_id_idx" ON "contact_lists" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "contacts_org_created_idx" ON "contacts" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "auth_signing_keys_tenant_isolation" ON "auth_signing_keys" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on') WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "broadcast_recipients_tenant_isolation" ON "broadcast_recipients" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on') WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "broadcasts_tenant_isolation" ON "broadcasts" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on') WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "contact_list_members_tenant_isolation" ON "contact_list_members" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on') WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "contact_lists_tenant_isolation" ON "contact_lists" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on') WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "contacts_tenant_isolation" ON "contacts" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on') WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on');