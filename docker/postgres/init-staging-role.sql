SELECT 'CREATE DATABASE weddingos OWNER weddingos'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'weddingos')\gexec

DO $block$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'weddingos_app') THEN
    CREATE ROLE weddingos_app LOGIN PASSWORD 'staging-app-role-secret' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'weddingos_worker') THEN
    CREATE ROLE weddingos_worker LOGIN PASSWORD 'staging-worker-role-secret' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$block$;

GRANT CONNECT ON DATABASE weddingos_staging TO weddingos_app;
GRANT USAGE ON SCHEMA public TO weddingos_app;
GRANT CONNECT ON DATABASE weddingos_staging TO weddingos_worker;
GRANT USAGE ON SCHEMA public TO weddingos_worker;
