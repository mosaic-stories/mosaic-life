## Why

A backend security review (GitHub issue [#104](https://github.com/mosaic-stories/mosaic-life/issues/104)) found seven low-severity hardening gaps in `services/core-api`: an unauthenticated local media route with an escapable path-traversal check, unverified provider emails trusted as identity, upload size never checked against the declared value, a raw SQL string interpolation, unlabeled "shared" AI facts that let one member's content steer every other member's persona prompt, prefix-based public-path matching that exposes `/docs`/`/metrics`, and no defense-in-depth against CSRF beyond `SameSite=Lax`. None is exploitable today in isolation, but each narrows the gap to a real incident as the product moves toward shared/production environments. Fixing them now is cheap and closes the bundle before it grows.

## What Changes

- Require session auth on the local-storage media upload/serve routes (`PUT/GET /media/{path:path}`) and replace the string-prefix traversal guard with `Path.is_relative_to()`.
- Verify uploaded object size against the declared/allowed size at `confirm_upload` time (via `head_object`/filesystem stat); delete oversized objects immediately and reject the confirmation.
- Hard-reject logins where the OAuth/OIDC provider reports `email_verified: false` / `verified_email: false`, for both Google and Keycloak.
- Parameterize the `story_id IN (...)` clause in `retrieval.py` instead of interpolating a joined string into `text()`.
- Wrap "shared" `LegacyFact` content injected into AI system prompts with an explicit untrusted-data delimiter/label, and cap its length.
- Replace prefix (`startswith`) public-path matching in `SessionMiddleware._is_public_path` with an exact-match set. Stop treating `/docs`/`/openapi.json` as public outside local/dev environments; keep `/metrics` public everywhere (Prometheus scrapes it unauthenticated in-cluster today via pod annotations — see Impact).
- Add CSRF defense-in-depth (Origin/Referer allowlist check) for unsafe methods (POST/PUT/PATCH/DELETE) on state-changing routes, on top of the existing `SameSite=Lax` cookie.

## Capabilities

### New Capabilities
- `media-upload-integrity`: authenticated, traversal-safe local media storage routes, and server-side verification that an uploaded object's actual size matches what was declared/allowed before it is confirmed.
- `platform-request-security`: exact-match (non-prefix) public-path allowlisting in the session middleware, environment-gated exposure of `/docs`/`/openapi.json` (kept auth-exempt only in local/dev; `/metrics` remains unconditionally public for the in-cluster Prometheus scrape), and an Origin/Referer allowlist check for unsafe HTTP methods as CSRF defense-in-depth.
- `ai-prompt-safety`: shared cross-member `LegacyFact` content is delimited, explicitly labeled as untrusted user-provided data (never as instructions), and length-capped before injection into AI system prompts.

### Modified Capabilities
- `auth-login`: add a requirement that login flows do not treat a provider-reported email as verified identity when the provider marks it unverified, for both Google and Keycloak.

## Impact

- **Affected code:** `services/core-api/app/routes/media.py`, `app/services/media.py`, `app/adapters/storage.py`, `app/auth/models.py`, `app/auth/router.py`, `app/services/retrieval.py`, `app/services/memory.py`, `app/config/personas.py`, `app/auth/middleware.py`, `app/main.py`.
- **No schema/migration changes.** No new external dependencies expected (Origin-check CSRF defense reuses existing settings; size verification reuses existing `head_object`/`Path.stat` calls already used for `file_exists`).
- **No breaking API changes** for callers using the app normally; unauthenticated/local-dev-only endpoints (local media routes, `/docs`/`/openapi.json` outside dev) gain new authorization requirements, and unverified-provider-email logins will be rejected.
- **`infra/helm/mosaic-life/templates/core-api-deployment.yaml`** carries `prometheus.io/scrape: "true"` / `prometheus.io/path: "/metrics"`, confirming Prometheus scrapes `/metrics` unauthenticated in-cluster today — `/metrics` stays on the public-path allowlist unconditionally (only the exact-match fix applies to it); only `/docs`/`/openapi.json` become environment-gated. No infra changes are needed for this decision.
- Requirement source: GitHub issue [#104](https://github.com/mosaic-stories/mosaic-life/issues/104) (items 12a–12g).

## Non-goals

- Not migrating local media storage to S3, and not building a general-purpose file-storage security framework — only closing the auth/traversal gap on the existing local-dev routes.
- Not implementing a full CSRF token issuance/rotation system (e.g., per-form double-submit tokens) — the Origin/Referer allowlist was selected over the double-submit token approach.
- Not building a generic prompt-injection detection/classification system — only delimiting and labeling shared facts as untrusted data, per item 12e's stated fix.
- Not re-architecting the `LegacyFact` visibility model (private/shared) or adding new visibility tiers.
- Not addressing any other findings from the broader security review outside issue #104's seven items.

## Open Questions

All resolved — decisions below were confirmed by the human reviewer on 2026-08-12:

1. **Unverified provider email (12b):** hard-reject login when `email_verified`/`verified_email` is `false`, for both Google and Keycloak. No migration, no partial-trust state.
2. **Oversized upload handling (12c):** delete the object from storage immediately when `confirm_upload` detects it exceeds the max size, and reject the confirmation. No GC job needed.
3. **CSRF defense mechanism (12g):** Origin/Referer allowlist check against `settings.app_url` (not a double-submit cookie token) — backend-only, no frontend coordination required.
4. **`/docs`, `/openapi.json`, `/metrics` gating (12f):** auth-gate `/docs` and `/openapi.json` outside local/dev. `/metrics` stays public everywhere — confirmed via `infra/helm/mosaic-life/templates/core-api-deployment.yaml`'s `prometheus.io/scrape: "true"` annotation that Prometheus scrapes it unauthenticated in-cluster today; gating it would break production monitoring without an accompanying infra change, which is out of scope here.
