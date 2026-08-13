# platform-request-security

## Purpose

Cross-cutting request-security requirements for the session middleware:
exact-match public-path allowlisting, environment-gating of API
documentation endpoints, unconditional public access to the metrics
endpoint, and Origin/Referer validation for state-changing requests as
defense-in-depth alongside the `SameSite=Lax` session cookie.

## Requirements

### Requirement: Public-path allowlisting uses exact matching
The session middleware SHALL determine whether a request path is exempt from authentication by exact match against a fixed allowlist of paths, and SHALL NOT use prefix matching for this determination.

#### Scenario: A path that shares a prefix with a public path but is not itself listed requires authentication
- **WHEN** a request is made to a path that begins with the same characters as a listed public path but is not itself an exact entry in the allowlist
- **THEN** the system SHALL treat the request as requiring authentication

#### Scenario: A path that exactly matches an allowlisted entry remains public
- **WHEN** a request is made to a path that exactly matches an entry in the public-path allowlist
- **THEN** the system SHALL exempt the request from session authentication

### Requirement: API documentation endpoints are not publicly exposed outside local/dev environments
The system SHALL exempt `/docs` and `/openapi.json` from session authentication only when running in a local/development environment; in all other environments these paths SHALL require a valid authenticated session like any other route.

#### Scenario: Docs are public in local/dev
- **WHEN** the service is running in a local/development environment and a request without a session cookie is made to `/docs` or `/openapi.json`
- **THEN** the system SHALL allow the request without requiring authentication

#### Scenario: Docs require authentication outside local/dev
- **WHEN** the service is running in a non-dev environment and a request without a valid session cookie is made to `/docs` or `/openapi.json`
- **THEN** the system SHALL reject the request with an authentication error

### Requirement: The metrics endpoint remains unauthenticated in all environments
The system SHALL keep `/metrics` on the public-path allowlist in every environment, since it is scraped unauthenticated in-cluster by Prometheus in production.

#### Scenario: Metrics endpoint is reachable without a session in any environment
- **WHEN** a request without a session cookie is made to `/metrics` in any environment
- **THEN** the system SHALL allow the request without requiring authentication

### Requirement: State-changing requests are validated against an Origin/Referer allowlist
For unsafe HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`) on authenticated routes, the system SHALL validate that the request's `Origin` header (or, if absent, `Referer` header) matches the configured trusted application origin, as a defense-in-depth layer in addition to the `SameSite=Lax` session cookie.

#### Scenario: State-changing request from an untrusted origin is rejected
- **WHEN** an authenticated request using an unsafe HTTP method includes an `Origin` (or, if absent, `Referer`) header that does not match the configured trusted application origin
- **THEN** the system SHALL reject the request with a client error and SHALL NOT perform the requested state change

#### Scenario: State-changing request from the trusted origin succeeds
- **WHEN** an authenticated request using an unsafe HTTP method includes an `Origin` (or `Referer`) header matching the configured trusted application origin
- **THEN** the system SHALL process the request normally
