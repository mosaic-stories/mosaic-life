-- Creates the keycloak user and database for local development
-- This runs automatically on first postgres container startup

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'keycloak') THEN
    CREATE USER keycloak WITH PASSWORD 'password';
  END IF;
END$$;

SELECT 'CREATE DATABASE keycloak OWNER keycloak'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec

GRANT ALL PRIVILEGES ON DATABASE keycloak TO keycloak;
