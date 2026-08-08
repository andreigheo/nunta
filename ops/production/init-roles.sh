#!/bin/sh
set -eu

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=app_password="$SARBATO_APP_PASSWORD" \
  --set=worker_password="$SARBATO_WORKER_PASSWORD" <<'SQL'
DO $block$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'weddingos_app') THEN
    CREATE ROLE weddingos_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'weddingos_worker') THEN
    CREATE ROLE weddingos_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$block$;

SELECT format('ALTER ROLE weddingos_app PASSWORD %L', :'app_password') \gexec
SELECT format('ALTER ROLE weddingos_worker PASSWORD %L', :'worker_password') \gexec

GRANT CONNECT ON DATABASE weddingos TO weddingos_app;
GRANT USAGE ON SCHEMA public TO weddingos_app;
GRANT CONNECT ON DATABASE weddingos TO weddingos_worker;
GRANT USAGE ON SCHEMA public TO weddingos_worker;
SQL
