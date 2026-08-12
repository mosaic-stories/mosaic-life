## Why

The Google OAuth `state` parameter is checked only for a valid HMAC signature and a 5-minute freshness window (`_verify_signed_state`, `services/core-api/app/auth/router.py:82-105`) — it is never tied to the browser that started the login and is not single-use. An attacker can start their own Google login, capture their own valid `state` + authorization `code`, and trick a victim's browser into visiting `/api/auth/google/callback?code=<attacker_code>&state=<valid_state>`. The callback accepts it, exchanges the attacker's code, and silently logs the victim into the **attacker's** account — who may then write stories or upload photos into an account the attacker controls and can read later. This is a login-CSRF / authorization-code-injection vulnerability.

Requirement source: [issue #99](https://github.com/mosaic-stories/mosaic-life/issues/99) (automated security review, severity **Medium**).

The Keycloak flow (`login_keycloak`/`callback_keycloak`, router.py:314-462) already avoids this: it generates a PKCE pair, signs the verifier into a short-lived httpOnly `SameSite=Lax` cookie, and requires that cookie at the callback — binding the exchange to the initiating browser and making it single-use once the cookie is cleared. Google's flow has none of this.

## What Changes

- A new short-lived, httpOnly, `SameSite=Lax`, signed **state cookie** is set at login start and required to match the `state` query parameter at the callback, on **both** Google and Keycloak — closing the general login-CSRF gap (today neither flow independently binds `state` itself to the browser; Keycloak is only protected as a side effect of PKCE). The cookie is cleared after one use, making `state` single-use.
- **PKCE is added to the Google flow**, mirroring Keycloak exactly: a `code_verifier`/`code_challenge` pair is generated at login start, `code_challenge` (S256) is sent on the authorize request, the verifier is stored in the existing signed `_PKCE_COOKIE`, and `code_verifier` is sent on the token exchange. `GoogleOAuthClient.exchange_code_for_tokens` gains an optional `code_verifier` parameter.
- **Consolidation**: `login_google`/`login_keycloak` and `callback_google`/`callback_keycloak` are refactored onto shared helpers for state-cookie issuance/verification and PKCE-cookie issuance/verification, so there is one canonical implementation of browser-binding instead of two parallel (and previously inconsistent) copies. Provider-specific logic (authorize URL construction, token exchange, userinfo fetch, error types) stays in `google.py`/`keycloak.py`.
- New test coverage for `login_google`/`callback_google`/`login_keycloak`/`callback_keycloak` — none of these four handlers have any test today (`tests/test_auth_settings.py` only covers the `_find_or_create_user` upsert helper).

## Capabilities

### New Capabilities
- `auth-login`: OAuth/OIDC login-flow security requirements — state-parameter CSRF binding (browser-bound, single-use) and PKCE, for both the Google and Keycloak providers. No living spec currently documents login-flow behavior; `openspec/specs/` only covers story/legacy capabilities.

### Modified Capabilities
(none — no existing spec covers auth flows)

## Impact

- **Backend** (`services/core-api`), no frontend changes (cookies are httpOnly and provider redirects are unchanged from the browser's perspective):
  - `app/auth/router.py`: new shared state-cookie helpers; `login_google`/`callback_google` gain PKCE + state-cookie binding; `login_keycloak`/`callback_keycloak` gain state-cookie binding; `_create_signed_state`/`_verify_signed_state` unchanged (still used for signature+freshness, now composed with the cookie check).
  - `app/auth/google.py`: `exchange_code_for_tokens` gains an optional `code_verifier` parameter.
  - `app/auth/keycloak.py`: `generate_pkce_pair` likely relocates to a shared, provider-agnostic module (exact placement decided in design.md) since Google now needs it too.
  - New tests: `tests/routes/test_auth_google.py`, `tests/routes/test_auth_keycloak.py` (or a combined `test_auth_router.py` — decided in design.md).
  - No schema change, no migration, no new settings/env vars (reuses `session_cookie_domain`, `session_cookie_secure`, `STATE_TOKEN_MAX_AGE`).

## Non-goals

- No change to session-cookie mechanics once login succeeds (`_build_and_set_session`, `UserSession` records) — unchanged.
- No change to `_find_or_create_user` upsert/collision logic.
- No new settings or environment variables.
- No change to the disabled Cognito provider (`app/auth/cognito.py.disabled`).
- No rate limiting or abuse detection on the login/callback endpoints — out of scope for this fix.
- No change to logout behavior.

## Open Questions

1. **Exact shape of the shared login/callback helpers** — design.md presents options; needs owner sign-off before apply.
2. **Cookie naming**: does the state cookie get one shared name across providers (`settings.auth_provider` is exclusive, so this is safe, mirroring `_PKCE_COOKIE`'s existing provider-agnostic name) or provider-suffixed names? Recommend shared name in design.md — needs confirmation.
3. **PR split**: one PR (fix + consolidation together, small enough given the current file size) or split fix-first/consolidate-second as issue #98 did? Proposed in tasks.md — needs confirmation.
