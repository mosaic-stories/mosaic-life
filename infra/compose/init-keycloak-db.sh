#!/bin/bash
# Creates the keycloak user and database for local development.
# This runs automatically on first postgres container startup (docker-entrypoint-initdb.d).
set -e

KC_DB_PASSWORD="${KC_DB_PASSWORD:-password}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'keycloak') THEN
    CREATE USER keycloak WITH PASSWORD '${KC_DB_PASSWORD}';
  END IF;
END\$\$;

SELECT 'CREATE DATABASE keycloak OWNER keycloak'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec

GRANT ALL PRIVILEGES ON DATABASE keycloak TO keycloak;
EOSQL
