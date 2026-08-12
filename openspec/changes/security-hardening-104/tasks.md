## 1. Media upload integrity (12a, 12c)

- [ ] 1.1 Add `require_auth(request)` to `upload_local_file` and `serve_local_file` in `app/routes/media.py`.
- [ ] 1.2 Replace the traversal check in both local routes with `full_path.resolve().is_relative_to(base_path.resolve())`.
- [ ] 1.3 Add `get_file_size(path) -> int | None` to `StorageAdapter` (abstract method).
- [ ] 1.4 Implement `get_file_size` in `S3StorageAdapter` using `_ops_client.head_object(...)["ContentLength"]` (reuse the existing `head_object` call pattern from `file_exists`).
- [ ] 1.5 Implement `get_file_size` in `LocalStorageAdapter` using `Path.stat().st_size`.
- [ ] 1.6 In `confirm_upload` (`app/services/media.py`), after `file_exists` succeeds, call `get_file_size` and reject (400) with the object deleted via `storage.delete_file(path)` if it exceeds `settings.max_upload_size_bytes`.
- [ ] 1.7 Update the confirmed `Media` record to persist the actual size read from storage rather than the client-declared value.
- [ ] 1.8 Add unit tests: unauthenticated local upload/serve rejected; traversal path (e.g. `../media-evil/x`) rejected; oversized confirm rejected and object deleted; in-limit confirm succeeds with correct size.
- [ ] 1.9 Run `just validate-backend` and `uv run pytest` (scoped to media tests) — both pass.

## 2. Login rejects unverified provider email (12b)

- [ ] 2.1 In `callback_google` (`app/auth/router.py`), reject the login before calling `_find_or_create_user` when `google_user.verified_email` is `False`.
- [ ] 2.2 In `callback_keycloak`, reject the login before calling `_find_or_create_user` when `oidc_user.email_verified` is `False`.
- [ ] 2.3 Log a rejection reason (e.g. `auth.email_unverified_rejected`) and add an `email_unverified` label to the existing login-rejection metric.
- [ ] 2.4 Add unit tests: Google login with `verified_email=False` rejected without creating/updating a user; Keycloak login with `email_verified=False` rejected; both providers succeed unchanged when verified.
- [ ] 2.5 Run `just validate-backend` and `uv run pytest` (scoped to auth tests) — both pass.

## 3. Parameterized story-ID query (12d)

- [ ] 3.1 In `retrieval.py`'s selective-share branch, replace the interpolated `story_id_list`/`IN ({story_id_list})` with named bound placeholders (`IN (:sid_0, :sid_1, ...)`), matching the parameterization style already used for `linked_legacy_id`/`top_k` in the same function.
- [ ] 3.2 Add/update a unit test covering the selective-share retrieval path to confirm results are unchanged after parameterization (include a story ID containing a character like `'` to prove injection safety, if test fixtures allow arbitrary IDs).
- [ ] 3.3 Run `just validate-backend` and `uv run pytest` (scoped to retrieval tests) — both pass.

## 4. Shared-fact prompt safety (12e)

- [ ] 4.1 In `app/config/personas.py`'s `build_system_prompt`, wrap the shared-facts section in an explicit delimiter/label marking it as untrusted, member-submitted data (never instructions).
- [ ] 4.2 Add a max-length constant (e.g. `MAX_FACT_CONTENT_LENGTH = 500`) and truncate each `fact.content` to that length when formatting the facts section.
- [ ] 4.3 Add unit tests: prompt output includes the untrusted-data label/delimiter around facts; an overly long fact is truncated in the generated prompt; existing prompt tests (persona prompt, story context) remain unaffected.
- [ ] 4.4 Run `just validate-backend` and `uv run pytest` (scoped to persona/memory tests) — both pass.

## 5. Request-layer security hardening (12f, 12g)

- [ ] 5.1 Replace the `public_paths` list in `SessionMiddleware._is_public_path` with a `frozenset` and change the check to exact match (`path in public_paths`).
- [ ] 5.2 Make `/docs` and `/openapi.json` conditional on `settings.env` being local/dev; otherwise exclude them from the public set. Keep `/metrics` unconditionally in the public set (Prometheus scrapes it unauthenticated in-cluster today — see design.md Decision 3).
- [ ] 5.3 Add an Origin/Referer allowlist check for unsafe methods (`POST`/`PUT`/`PATCH`/`DELETE`) on authenticated routes, comparing against `settings.app_url`; reject with 403 on mismatch (per design.md Decision 4).
- [ ] 5.4 Add a `core_api_csrf_rejections_total` counter labeled by `path`, incremented on Origin/Referer mismatch.
- [ ] 5.5 Add unit tests: a path sharing a prefix with a public path now requires auth; `/docs`/`/openapi.json` public in dev env, auth-required in non-dev env; `/metrics` remains public in both dev and non-dev; a POST/PUT/PATCH/DELETE with a mismatched Origin is rejected; same-origin requests succeed unchanged.
- [ ] 5.6 Run `just validate-backend` and `uv run pytest` (scoped to middleware tests) — both pass.

## 6. Full validation and verification

- [ ] 6.1 Run `just validate-backend` for the full `services/core-api` tree.
- [ ] 6.2 Run the full `uv run pytest` suite and confirm no regressions.
- [ ] 6.3 Start the compose stack (`docker compose -f infra/compose/docker-compose.yml up -d`) and manually verify: local media upload/serve requires login; a normal upload → confirm flow still works end-to-end from the web app; `/docs`/`/openapi.json` are gated outside dev while `/metrics` stays reachable unauthenticated; a same-origin mutating request (e.g. creating a story) still succeeds from the web app.
- [ ] 6.4 Record what was observed during manual verification in the PR description.
