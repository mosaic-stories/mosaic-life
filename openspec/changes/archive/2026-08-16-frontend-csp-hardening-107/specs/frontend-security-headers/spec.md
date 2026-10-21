## ADDED Requirements

### Requirement: Production CSP excludes non-production hosts
The production nginx configuration SHALL NOT include any Content-Security-Policy source that is not a genuine production origin (self, the configured S3/media hosts, and the Google profile-picture CDN).

#### Scenario: Dev-only host is absent from the production CSP
- **WHEN** the production CSP header is rendered by nginx
- **THEN** it SHALL NOT contain `s3.m5.build-it.xyz` or any other non-production development host

### Requirement: Production responses emit HSTS
The production nginx configuration SHALL emit a `Strict-Transport-Security` response header on all responses, since no upstream edge is confirmed to set one.

#### Scenario: HSTS header present on the main app response
- **WHEN** a client requests any path served by the production web app
- **THEN** the response SHALL include a `Strict-Transport-Security` header with a `max-age` of at least one year and `includeSubDomains`
