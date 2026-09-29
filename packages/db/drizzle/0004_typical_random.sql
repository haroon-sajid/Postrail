CREATE TABLE "message_bodies" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"html" text,
	"text" text,
	"reply_to" text,
	"headers" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "message_bodies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "message_bodies" ADD CONSTRAINT "message_bodies_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_bodies" ADD CONSTRAINT "message_bodies_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_bodies_org_id_idx" ON "message_bodies" USING btree ("org_id");--> statement-breakpoint
CREATE POLICY "message_bodies_tenant_isolation" ON "message_bodies" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on') WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid or current_setting('app.bypass_rls', true) = 'on');