-- What the app's own login may do, and nothing more: read and write the farm's records, never change a table, lift a
-- guard, or change or remove what is kept. Run as the database's owner, with the login made already
-- (docs/runbooks/deploy.md, "The app's own login"):
--
--   psql "<owner's url>" -v ON_ERROR_STOP=1 -v app_role=openfarm_app -f scripts/app-login-grants.sql
--
-- Run again after restoring a copy into a new database: a copy carries the farm, never who may touch it, and an app
-- pointed at a restored database without these is refused on every table.

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'app_role') \gexec
GRANT USAGE ON SCHEMA public TO :"app_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_role";
-- What is kept as written: read and added to, never changed or taken away. A paper's Version takes its review once,
-- so it keeps UPDATE; the database's own guard lets nothing else through.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_event, sop_version, ration_version FROM :"app_role";
REVOKE DELETE, TRUNCATE ON paper_template_version FROM :"app_role";
-- Readiness asks which migration the database has applied.
GRANT USAGE ON SCHEMA drizzle TO :"app_role";
GRANT SELECT ON drizzle.__drizzle_migrations TO :"app_role";
-- Tables a migration adds later are the app's to use too, as the owner makes them.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_role";
