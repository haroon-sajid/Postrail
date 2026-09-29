-- Custom migration (drizzle-kit generate --custom). Drizzle can ENABLE row level security
-- but has no schema-level way to FORCE it. Without FORCE, the table owner (the role in
-- DATABASE_URL) bypasses every policy, which would make the isolation test meaningless.
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mailboxes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "suppressions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "templates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" FORCE ROW LEVEL SECURITY;
