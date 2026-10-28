-- Custom migration. Same reasoning as 0001: the owning role would otherwise bypass the
-- tenant policy on the new tables. See docs/adr/0002-tenancy-and-rls.md.
ALTER TABLE "auth_challenges" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auth_identities" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auth_sessions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auth_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auth_users" FORCE ROW LEVEL SECURITY;
