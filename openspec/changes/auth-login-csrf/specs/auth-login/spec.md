## ADDED Requirements

### Requirement: OAuth state is bound to the initiating browser
For every active login provider (Google, Keycloak), the system SHALL require that the `state` value presented at a provider's callback endpoint matches a credential established in the same browser at login start. The system SHALL reject the callback if this binding cannot be verified, independent of whether the `state` value's own signature and freshness are valid.

#### Scenario: Callback from a different browser is rejected
- **WHEN** a client presents a validly-signed, unexpired `state` value to the callback endpoint without the browser-scoped credential established for that value at login start
- **THEN** the system SHALL reject the request with an authentication error and SHALL NOT create a session

#### Scenario: Callback from the initiating browser succeeds
- **WHEN** the browser that started the login presents the callback with the `state` value and browser-scoped credential established at login start, together with a valid authorization code
- **THEN** the system SHALL exchange the code and create a session for the authenticated user

### Requirement: OAuth state is single-use
The system SHALL invalidate the browser-scoped login credential established at login start after its first use at the callback, regardless of whether that callback attempt succeeds or fails.

#### Scenario: Replaying a completed login callback is rejected
- **WHEN** a client replays a previously-used callback request (same `state` and authorization code) after the login flow has already completed once
- **THEN** the system SHALL reject the replayed request and SHALL NOT create a new session

### Requirement: Google login uses PKCE
The system SHALL use Proof Key for Code Exchange (PKCE) on the Google OAuth login flow: a code verifier/challenge pair is generated at login start, the challenge is presented to Google's authorization endpoint, and the verifier is presented only at token exchange — consistent with the existing Keycloak login flow.

#### Scenario: Google token exchange includes the PKCE verifier
- **WHEN** the system exchanges a Google authorization code for tokens
- **THEN** the token exchange request SHALL include the code verifier generated for that login attempt

#### Scenario: Missing or invalid PKCE verifier at callback is rejected
- **WHEN** the Google callback is invoked without a valid PKCE verifier established at login start
- **THEN** the system SHALL reject the request with an authentication error and SHALL NOT create a session

### Requirement: Login flows fail closed on binding failure
The system SHALL reject a login callback rather than fall back to a less-secure verification path when the browser-binding credential, the `state` signature/freshness, or the PKCE verifier cannot be validated.

#### Scenario: Missing browser-binding credential is rejected, not skipped
- **WHEN** the callback endpoint is invoked without the browser-scoped credential established at login start
- **THEN** the system SHALL reject the request with a client error rather than proceeding as if the credential were valid or absent-but-acceptable
