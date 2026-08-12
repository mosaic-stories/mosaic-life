## Context

`services/core-api/app/auth/router.py` implements two OAuth/OIDC login flows behind a single active `settings.auth_provider` switch (`"google"` or `"keycloak"` — never both at once, each handler 404s if it isn't the active provider):

- **Google** (`login_google`/`callback_google`, router.py:206-306): builds a signed `state` (`_create_signed_state`/`_verify_signed_state`, router.py:68-105 — HMAC signature + 5-minute freshness only), redirects to Google's authorize endpoint, and on callback verifies `state`, exchanges `code` for tokens, and creates a session. No PKCE, no browser-binding beyond the `state` signature.
- **Keycloak** (`login_keycloak`/`callback_keycloak`, router.py:314-462): same signed-`state` mechanism, **plus** a PKCE pair (`KeycloakOIDCClient.generate_pkce_pair()`) whose verifier is signed (`_sign_pkce_value`/`_verify_and_extract_pkce_value`, router.py:108-124) and stored in an httpOnly `SameSite=Lax` cookie (`_PKCE_COOKIE`, max-age = `STATE_TOKEN_MAX_AGE` = 300s), required and cleared at the callback.

Neither flow binds the `state` value *itself* to a cookie; Keycloak is only browser-bound as a side effect of requiring the PKCE verifier cookie at token exchange. Google has neither protection, which is the CSRF/authorization-code-injection hole in [issue #99](https://github.com/mosaic-stories/mosaic-life/issues/99).

The owner has decided (see proposal.md) to consolidate both providers onto shared browser-binding helpers rather than patch Google in isolation, matching the "one canonical implementation, not N copies" precedent from issue #98 (`openspec/changes/archive/2026-08-12-story-write-authz/`).

## Goals / Non-Goals

**Goals:**
- Bind `state` to the initiating browser, for both providers, via a short-lived signed cookie compared with `hmac.compare_digest` at the callback.
- Make `state` single-use by clearing the cookie after the first callback attempt (success or failure).
- Add PKCE to the Google flow, identical in shape to Keycloak's existing implementation.
- Eliminate duplicated login/callback scaffolding between the two providers where doing so doesn't obscure real provider differences.
- Add test coverage for all four handlers (currently zero).

**Non-Goals:**
- No change to what happens *after* a session is created (`_build_and_set_session`, `UserSession` persistence).
- No rate limiting, IP allow-listing, or abuse detection on login/callback.
- No change to the Cognito (disabled) provider.
- No server-side nonce/state store (Postgres or Redis) — see Decision 1.

## Decisions

### 1. Browser-binding mechanism: signed cookie (double-submit), not a server-side store

**Chosen:** Extend the existing pattern — store the value to be checked in a short-lived httpOnly, `SameSite=Lax`, signed cookie set at login start; require an exact match at the callback via `hmac.compare_digest`; delete the cookie after the first use.

**Alternative considered — server-side one-time nonce table:** Persist issued `state` nonces in Postgres (or an in-memory/Redis store) and delete-on-read at the callback. Rejected: adds a DB write on every login start, a cleanup/expiry job for abandoned rows, and a new table — for no additional security benefit over the cookie approach in this threat model (the attacker's forged callback request never carries the victim's browser's cookies, so it's rejected regardless of whether the "used" bookkeeping lives in a cookie or a database row). The codebase has no existing session/nonce store to extend, so this would be new infrastructure for a threat model the cookie already closes. Keycloak's existing PKCE cookie already validates this approach in production.

### 2. Shared helper shape

**Chosen (Option A) — two focused helpers, providers keep their own route handlers:**

```python
def _issue_oauth_start_cookies(
    response: RedirectResponse, request: Request, settings: Settings, state: str, *, pkce: bool
) -> str | None:
    """Set the state-binding cookie (always) and, if pkce, generate+set the PKCE
    verifier cookie. Returns the code_challenge to add to the authorize URL, or None."""

def _verify_oauth_callback_cookies(
    request: Request, response: RedirectResponse, settings: Settings, state: str, *, pkce: bool
) -> str | None:
    """Verify+clear the state cookie (raises HTTPException(400) on mismatch/absence).
    If pkce, also verify+clear the PKCE cookie and return the code_verifier (raises on
    absence/invalid); returns None when pkce=False."""
```

Each provider's `login_*`/`callback_*` keeps owning its control flow (building the provider-specific authorize URL, calling its own client's `exchange_code_for_tokens`/`get_user_info`, and its own exception handling) and just calls these two helpers at the right points. This is a small, additive change to each handler's body rather than a rewrite.

**Alternative considered (Option B) — full flow-owning helpers** (`_begin_oauth_login(provider, authorize_url_builder)` / `_complete_oauth_callback(provider, token_exchanger, userinfo_fetcher)` that own the entire request/response construction and take provider callables): more DRY, but it would hide real provider differences behind callables — Google's extra `access_type`/`prompt` authorize params, Keycloak's discovery-based endpoint lookup (`await kc.get_authorization_endpoint()`, which can raise `502`), and each provider's distinct error types (`GoogleOAuthError` vs `KeycloakOIDCError`) — and is a much larger structural diff to a security-sensitive path serving both providers simultaneously. Rejected as higher regression risk for the marginal DRY gain; Option A already removes the actual duplication (cookie handling), which is the only part that was truly identical.

**Alternative considered (Option C) — no consolidation, Google-only fix:** matches the issue's literal scope but was explicitly rejected by the owner in favor of consolidation (proposal.md).

**Recommendation:** Option A. Selected as the chosen decision above — confirm no objection before `/opsx:apply`.

### 3. Cookie naming: shared across providers

`_STATE_COOKIE = "mosaic_oauth_state"` (new) and the existing `_PKCE_COOKIE = "mosaic_pkce"` are both reused across Google and Keycloak, unqualified by provider name — consistent with `_PKCE_COOKIE`'s existing naming and safe because `settings.auth_provider` gates every handler exclusively; only one provider's flow can ever be in progress for a given deployment.

### 4. `generate_pkce_pair` relocation

Move the static method off `KeycloakOIDCClient` into a new `app/auth/pkce.py` (`generate_pkce_pair() -> tuple[str, str]`, `sign_pkce_value`/`verify_and_extract_pkce_value` also move here from `router.py` since they're provider-agnostic crypto helpers, not routing logic). Both `router.py` and `google.py`/`keycloak.py` import from this module. No back-compat re-export on `KeycloakOIDCClient` — update the one call site in `router.py`.

### 5. State-cookie content and verification order

The cookie stores the exact same signed `state` string returned by `_create_signed_state` (not a second independent nonce) — one value to generate, sign, and compare. At the callback: first verify the query-param `state`'s HMAC signature and freshness (`_verify_signed_state`, unchanged), then compare the cookie's value against the query-param value with `hmac.compare_digest`. Reject (400) if either check fails, or if the cookie is absent. Clear the cookie in the response regardless of outcome (single-use).

### 6. Google PKCE wire format

`GoogleOAuthClient.exchange_code_for_tokens` gains an optional `code_verifier: str | None = None` parameter; when set, `"code_verifier": code_verifier` is added to the token POST body. Google's token endpoint has supported optional PKCE for confidential (server-side, `client_secret`-bearing) clients since 2020 as defense-in-depth on top of `client_secret`; this is additive and does not change Google's expected request shape for clients that don't send it.

## Risks / Trade-offs

- **[Risk]** Consolidating touches Keycloak's currently-working flow (likely the only active provider in prod) → regression risk on the one auth path everyone depends on. **Mitigation:** net-new test coverage for both providers lands *before* any behavior change ships (tasks.md §1); manual multi-browser verification against both providers in the compose stack is a required task before merge; PR review explicitly checks Keycloak parity against its pre-change behavior.
- **[Risk]** Unexpected interaction between Google's OAuth endpoint and PKCE params for this specific client configuration → login breakage. **Mitigation:** end-to-end smoke test against real Google OAuth in dev (not just mocked unit tests) is a required task before merge.
- **[Risk]** Shared cookie names across providers could theoretically cross-contaminate state if `AUTH_PROVIDER` is flipped mid-flight (user starts login under provider A, env changes, callback arrives under provider B). **Mitigation:** not a new risk — every handler already 404s when `settings.auth_provider` doesn't match, so a mid-flight provider switch already breaks the flow today (different authorize/token endpoints entirely); this change doesn't make that scenario worse.
- **[Risk]** 5-minute cookie `max_age` (`STATE_TOKEN_MAX_AGE`, unchanged) means a slow login (e.g., a lengthy 2FA prompt at the provider) fails and the user must retry. **Mitigation:** pre-existing constraint — Keycloak's PKCE cookie already uses this window today; not a new regression.
- **[Risk]** The cookies must be cleared on **every** callback return path once verified — not just the success path — or a failed first attempt (e.g., a transient provider error) leaves the still-valid `state`+cookie pair replayable with a *different*, attacker-supplied `code` for the remainder of the 5-minute window, defeating single-use. FastAPI does not propagate headers set on an injected `Response` dependency onto a different `Response` object returned explicitly (a documented FastAPI/Starlette gotcha), so `response.delete_cookie(...)` must be called explicitly on whichever `RedirectResponse` each branch actually returns. Today's `callback_keycloak` already has this latent gap on its generic `except Exception` path (raises a bare `HTTPException(500)` with no chance to clear `_PKCE_COOKIE`). **Mitigation:** tasks.md includes an explicit task to clear both cookies on every branch of both callback handlers, including converting the generic-exception branch from a bare `HTTPException(500)` to a redirect-with-error (matching the existing `GoogleOAuthError`/`KeycloakOIDCError` branches) so it, too, can carry the clearing headers — a small, deliberate behavior improvement beyond the literal issue ask, justified by this correctness requirement.

## Migration Plan

No data migration; no schema change. Deploy via the standard GitOps path (merge → CI build → ArgoCD sync). The change is purely additive at the protocol layer (new cookie, new authorize/token params) and **fails closed**: a missing or mismatched cookie returns 400 rather than silently falling back to the old (vulnerable) behavior, so a bad deploy blocks logins loudly instead of reopening the CSRF hole. Rollback is a plain revert — no cookies or session state need to be unwound, since state/PKCE cookies are ephemeral (≤5 min) and sessions created under the new flow are ordinary session cookies indistinguishable from ones created today.

## Observability

- Log events (structured JSON, matching the existing `auth.<provider>.*` naming already in router.py): `auth.google.state_cookie_mismatch`, `auth.google.pkce_cookie_missing`, `auth.google.pkce_cookie_invalid`, `auth.keycloak.state_cookie_mismatch` — WARNING level, `extra={"provider": ..., "reason": ...}`, mirroring the existing `auth.google.invalid_state` / `auth.keycloak.invalid_state` shape.
- New Counter in `app/observability/metrics.py`, mirroring the existing `AUTHZ_DECISIONS` pattern from the #98 fix:
  ```python
  AUTH_LOGIN_REJECTIONS = Counter(
      "auth_login_rejections_total",
      "OAuth login callback rejections at the CSRF/PKCE binding layer",
      ["service", "provider", "reason"],
  )
  ```
  `reason` ∈ `{invalid_state_signature, state_cookie_missing, state_cookie_mismatch, missing_pkce_cookie, invalid_pkce_cookie}`. Gives ops visibility into CSRF-attempt volume after the fix ships.
- No new OTel spans needed — routes are already auto-instrumented (`opentelemetry-instrumentation-fastapi`, wired in `app/main.py`), and login/callback are single fast handlers with no multi-step internal operations warranting manual span breakdown.

## Open Questions

Carried from proposal.md — resolve before `/opsx:apply`:
1. Confirm Decision 2 (Option A helper shape) — no objection assumed unless raised.
2. Confirm Decision 3 (shared cookie names) — no objection assumed unless raised.
3. PR split: proposed as one PR in tasks.md (fix + consolidation together) given the total diff is still small (~2 files, ~150-250 LOC) — confirm, or split fix/consolidation into two PRs as issue #98 did.
