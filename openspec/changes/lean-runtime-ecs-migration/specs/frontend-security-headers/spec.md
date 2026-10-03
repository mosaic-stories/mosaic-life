## MODIFIED Requirements

### Requirement: Production responses emit HSTS
Every production HTTPS response SHALL include a `Strict-Transport-Security` header. This covers responses nginx serves directly, as well as responses the load balancer routes straight to core-api: `/api/*` on the apex host, and everything on `api.mosaiclife.me`. nginx SHALL keep emitting the header on the responses it serves. The load balancer's HTTPS listener SHALL inject it where nginx is bypassed.

#### Scenario: HSTS header present on the main app response
- **WHEN** a client requests any path served by the production web app
- **THEN** the response SHALL include a `Strict-Transport-Security` header with a `max-age` of at least one year and `includeSubDomains`

#### Scenario: HSTS header present on API responses that bypass nginx
- **WHEN** a client requests `https://mosaiclife.me/api/...` or `https://api.mosaiclife.me/...` in production
- **THEN** the response SHALL include a `Strict-Transport-Security` header with a `max-age` of at least one year and `includeSubDomains`
