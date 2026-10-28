CREATE TYPE "public"."auth_challenge_kind" AS ENUM('magic_link', 'email_otp', 'oauth_code');--> statement-breakpoint
CREATE TYPE "public"."auth_provider" AS ENUM('google');--> statement-breakpoint
CREATE TABLE "auth_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "auth_challenge_kind" NOT NULL,
	"email" text NOT NULL,
	"user_id" uuid,
	"token_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_challenges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "auth_provider" NOT NULL,
	"provider_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_identities_org_provider_uq" UNIQUE("org_id","provider","provider_user_id")
);
--> statement-breakpoint
ALTER TABLE "auth_identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth_settings" (
	"org_id" uuid NOT NULL,
	"app_name" text,
	"redirect_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"google_enabled" boolean DEFAULT true NOT NULL,
	"magic_link_enabled" boolean DEFAULT true NOT NULL,
	"email_otp_enabled" boolean DEFAULT true NOT NULL,
	"google_client_id" text,
	"google_client_secret_enc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_settings_org_id_pk" PRIMARY KEY("org_id")
);
--> statement-breakpoint
ALTER TABLE "auth_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text,
	"image" text,
	"last_sign_in_at" timestamp with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_users_org_email_uq" UNIQUE("org_id","email")
);
--> statement-breakpoint
ALTER TABLE "auth_users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_settings" ADD CONSTRAINT "auth_settings_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_users" ADD CONSTRAINT "auth_users_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_challenges_org_token_idx" ON "auth_challenges" USING btree ("org_id","token_hash");--> statement-breakpoint
CREATE INDEX "auth_challenges_org_email_created_idx" ON "auth_challenges" USING btree ("org_id","email","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "auth_identities_org_user_idx" ON "auth_identities" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_org_user_idx" ON "auth_sessions" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "auth_users_org_created_idx" ON "auth_users" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "auth_challenges_tenant_isolation" ON "auth_challenges" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on') WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "auth_identities_tenant_isolation" ON "auth_identities" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on') WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "auth_sessions_tenant_isolation" ON "auth_sessions" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on') WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "auth_settings_tenant_isolation" ON "auth_settings" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on') WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on');--> statement-breakpoint
CREATE POLICY "auth_users_tenant_isolation" ON "auth_users" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on') WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on');