-- Custom migration. Same reasoning as 0001: the owning role would otherwise bypass the
-- tenant policy on the new tables. See docs/adr/0002-tenancy-and-rls.md.
ALTER TABLE "auth_signing_keys" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "broadcast_recipients" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "broadcasts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_list_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_lists" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contacts" FORCE ROW LEVEL SECURITY;
