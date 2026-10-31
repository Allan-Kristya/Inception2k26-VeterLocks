#!/bin/sh
set -eu
: "${POSTGRES_RUNTIME_PASSWORD:?POSTGRES_RUNTIME_PASSWORD must be set}"
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 --set=runtime_password="$POSTGRES_RUNTIME_PASSWORD" <<'SQL'
SELECT format(
  'CREATE ROLE laporaman_runtime LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
  :'runtime_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laporaman_runtime')\gexec
ALTER ROLE laporaman_runtime LOGIN PASSWORD :'runtime_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT CONNECT ON DATABASE laporaman TO laporaman_runtime;
GRANT USAGE ON SCHEMA public TO laporaman_runtime;
SQL
