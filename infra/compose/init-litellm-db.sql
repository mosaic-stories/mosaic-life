-- Creates the litellm database for local development
-- This runs automatically on first postgres container startup

SELECT 'CREATE DATABASE litellm'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'litellm')\gexec