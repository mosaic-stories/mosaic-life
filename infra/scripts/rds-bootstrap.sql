-- rds-bootstrap.sql: one-time (idempotent) setup of the lean RDS instance.
--
-- Creates two login roles and two databases on the shared instance:
--   mosaic_prod    -> database core
--   mosaic_staging -> database core_staging
-- Each role can CONNECT only to its own database (CONNECT revoked from PUBLIC).
-- The pgvector extension is created in both databases.
--
-- Run as the master user (Secrets Manager: mosaic/shared/rds-lean/master) against the
-- `postgres` database, from a one-off ECS task or any host inside the VPC that carries
-- the mosaic-db-clients security group (e.g. the db-copy image, which ships psql):
--
--   PGSSLMODE=require PGPASSWORD="$MASTER_PASSWORD" \
--   psql -X -h "$DB_HOST" -U mosaic_admin -d postgres \
--        -v prod_password="$PROD_PASSWORD" -v staging_password="$STAGING_PASSWORD" \
--        -f rds-bootstrap.sql
--
-- Re-running is safe: roles/databases are only created when missing, and the role
-- passwords are re-applied from the supplied variables.

\set ON_ERROR_STOP on

-- Roles (created only when missing, then password always re-applied).
SELECT 'CREATE ROLE mosaic_prod LOGIN'
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mosaic_prod') \gexec
SELECT 'CREATE ROLE mosaic_staging LOGIN'
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mosaic_staging') \gexec
ALTER ROLE mosaic_prod WITH LOGIN PASSWORD :'prod_password';
ALTER ROLE mosaic_staging WITH LOGIN PASSWORD :'staging_password';

-- The master must be a member of both roles to CREATE DATABASE ... OWNER <role> and
-- to run `pg_restore --role=<role>` (SET ROLE).
GRANT mosaic_prod, mosaic_staging TO CURRENT_USER;

-- Databases (CREATE DATABASE cannot run in a DO block, hence \gexec).
SELECT 'CREATE DATABASE core OWNER mosaic_prod'
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'core') \gexec
SELECT 'CREATE DATABASE core_staging OWNER mosaic_staging'
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'core_staging') \gexec

-- Isolation: nobody connects by default; only the owning role (and, through role
-- membership, the master).
REVOKE CONNECT ON DATABASE core, core_staging FROM PUBLIC;
GRANT CONNECT ON DATABASE core TO mosaic_prod;
GRANT CONNECT ON DATABASE core_staging TO mosaic_staging;

\connect core
CREATE EXTENSION IF NOT EXISTS vector;

\connect core_staging
CREATE EXTENSION IF NOT EXISTS vector;
