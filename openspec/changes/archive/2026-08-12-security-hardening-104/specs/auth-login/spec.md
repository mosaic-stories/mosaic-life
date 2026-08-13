## ADDED Requirements

### Requirement: Login is rejected when the provider reports the email as unverified
For every active login provider (Google, Keycloak), the system SHALL check the provider-reported email-verification flag (`verified_email` for Google, `email_verified` for Keycloak) at login time. If the provider reports the email as unverified, the system SHALL reject the login and SHALL NOT create or update a user record for that identity.

#### Scenario: Google login with an unverified email is rejected
- **WHEN** a Google OAuth callback completes successfully but the returned user info reports `verified_email: false`
- **THEN** the system SHALL reject the login with an authentication error and SHALL NOT create or update a `User` record

#### Scenario: Keycloak login with an unverified email is rejected
- **WHEN** a Keycloak OIDC callback completes successfully but the returned user info reports `email_verified: false`
- **THEN** the system SHALL reject the login with an authentication error and SHALL NOT create or update a `User` record

#### Scenario: Login with a verified email proceeds normally
- **WHEN** a Google or Keycloak callback completes successfully and the provider reports the email as verified
- **THEN** the system SHALL find-or-create the user record and establish a session as before
