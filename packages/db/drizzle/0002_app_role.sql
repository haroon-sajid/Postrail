-- Custom migration (drizzle-kit generate --custom). See docs/adr/0002-tenancy-and-rls.md.
--
-- The connecting Neon role (neondb_owner) has BYPASSRLS, so policies never apply to it.
-- withOrg/withSystem therefore run `SET LOCAL ROLE postrail_app`: a role that owns
-- nothing and has no BYPASSRLS. This migration creates it and wires up the grants.
-- The connecting role must have CREATEROLE (Neon's default owner role does).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postrail_app') THEN
    CREATE ROLE postrail_app NOLOGIN NOBYPASSRLS NOINHERIT;
  END IF;
END $$;--> statement-breakpoint
-- Membership is what allows the connecting role to SET ROLE postrail_app.
GRANT postrail_app TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO postrail_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO postrail_app;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO postrail_app;--> statement-breakpoint
-- Tables and sequences created by future migrations (run by the owner) get the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO postrail_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO postrail_app;
