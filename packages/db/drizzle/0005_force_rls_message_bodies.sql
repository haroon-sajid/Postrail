-- Custom migration. Same reasoning as 0001: the owning role would otherwise bypass the
-- tenant policy on the new table. See docs/adr/0002-tenancy-and-rls.md.
ALTER TABLE "message_bodies" FORCE ROW LEVEL SECURITY;
