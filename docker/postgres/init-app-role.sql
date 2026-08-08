DO $block$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'weddingos_app') THEN
    CREATE ROLE weddingos_app LOGIN PASSWORD 'weddingos_app' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$block$;

DO $block$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'weddingos_worker') THEN
    CREATE ROLE weddingos_worker LOGIN PASSWORD 'weddingos_worker' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$block$;

GRANT CONNECT ON DATABASE weddingos TO weddingos_app;
GRANT USAGE ON SCHEMA public TO weddingos_app;
GRANT CONNECT ON DATABASE weddingos TO weddingos_worker;
GRANT USAGE ON SCHEMA public TO weddingos_worker;
