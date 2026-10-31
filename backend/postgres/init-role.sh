#!/bin/sh
set -eu

: "${POSTGRES_APP_PASSWORD:?POSTGRES_APP_PASSWORD must be set}"

# psql's variable quoting and format(%L) keep the password out of SQL string syntax.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=app_password="$POSTGRES_APP_PASSWORD" <<'SQL'
SELECT format(
  'CREATE ROLE laporaman_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT',
  :'app_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laporaman_app')\gexec

ALTER ROLE laporaman_app LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT CONNECT ON DATABASE laporaman TO laporaman_app;
GRANT USAGE ON SCHEMA public TO laporaman_app;
ALTER DEFAULT PRIVILEGES FOR ROLE laporaman_admin IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO laporaman_app;
ALTER DEFAULT PRIVILEGES FOR ROLE laporaman_admin IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO laporaman_app;
SQL
