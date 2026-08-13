## 1. Media upload integrity (12a, 12c)

- [x] 1.1 Add `require_auth(request)` to `upload_local_file` and `serve_local_file` in `app/routes/media.py`.
- [x] 1.2 Replace the traversal check in both local routes with `full_path.resolve().is_relative_to(base_path.resolve())`.
- [x] 1.3 Add `get_file_size(path) -> int | None` to `StorageAdapter` (abstract method).
- [x] 1.4 Implement `get_file_size` in `S3StorageAdapter` using `_ops_client.head_object(...)["ContentLength"]` (reuse the existing `head_object` call pattern from `file_exists`).
- [x] 1.5 Implement `get_file_size` in `LocalStorageAdapter` using `Path.stat().st_size`.
- [x] 1.6 In `confirm_upload` (`app/services/media.py`), after `file_exists` succeeds, call `get_file_size` and reject (400) with the object deleted via `storage.delete_file(path)` if it exceeds `settings.max_upload_size_bytes`.
- [x] 1.7 Update the confirmed `Media` record to persist the actual size read from storage rather than the client-declared value.
- [x] 1.8 Add unit tests: unauthenticated local upload/serve rejected; traversal path (e.g. `../media-evil/x`) rejected; oversized confirm rejected and object deleted; in-limit confirm succeeds with correct size.
- [x] 1.9 Run `just validate-backend` and `uv run pytest` (scoped to media tests) — both pass.

## 2. Login rejects unverified provider email (12b)

- [x] 2.1 In `callback_google` (`app/auth/router.py`), reject the login before calling `_find_or_create_user` when `google_user.verified_email` is `False`.
- [x] 2.2 In `callback_keycloak`, reject the login before calling `_find_or_create_user` when `oidc_user.email_verified` is `False`.
- [x] 2.3 Log a rejection reason (e.g. `auth.email_unverified_rejected`) and add an `email_unverified` label to the existing login-rejection metric.
- [x] 2.4 Add unit tests: Google login with `verified_email=False` rejected without creating/updating a user; Keycloak login with `email_verified=False` rejected; both providers succeed unchanged when verified.
- [x] 2.5 Run `just validate-backend` and `uv run pytest` (scoped to auth tests) — both pass.

## 3. Parameterized story-ID query (12d)

- [x] 3.1 In `retrieval.py`'s selective-share branch, replace the interpolated `story_id_list`/`IN ({story_id_list})` with named bound placeholders (`IN (:sid_0, :sid_1, ...)`), matching the parameterization style already used for `linked_legacy_id`/`top_k` in the same function.
- [x] 3.2 Add/update a unit test covering the selective-share retrieval path to confirm results are unchanged after parameterization (include a story ID containing a character like `'` to prove injection safety, if test fixtures allow arbitrary IDs).
- [x] 3.3 Run `just validate-backend` and `uv run pytest` (scoped to retrieval tests) — both pass.

## 4. Shared-fact prompt safety (12e)

- [x] 4.1 In `app/config/personas.py`'s `build_system_prompt`, wrap the shared-facts section in an explicit delimiter/label marking it as untrusted, member-submitted data (never instructions).
- [x] 4.2 Add a max-length constant (e.g. `MAX_FACT_CONTENT_LENGTH = 500`) and truncate each `fact.content` to that length when formatting the facts section.
- [x] 4.3 Add unit tests: prompt output includes the untrusted-data label/delimiter around facts; an overly long fact is truncated in the generated prompt; existing prompt tests (persona prompt, story context) remain unaffected.
- [x] 4.4 Run `just validate-backend` and `uv run pytest` (scoped to persona/memory tests) — both pass.

## 5. Request-layer security hardening (12f, 12g)

- [x] 5.1 Replace the `public_paths` list in `SessionMiddleware._is_public_path` with a `frozenset` and change the check to exact match (`path in public_paths`).
- [x] 5.2 Make `/docs` and `/openapi.json` conditional on `settings.env` being local/dev; otherwise exclude them from the public set. Keep `/metrics` unconditionally in the public set (Prometheus scrapes it unauthenticated in-cluster today — see design.md Decision 3). Excluding a path from `SessionMiddleware`'s public-path set only makes the middleware run its normal cookie-validation logic against it — the middleware never rejects a request itself, only `require_auth()` does, and FastAPI's built-in `/docs`/`/openapi.json` routes never call it. Closed that gap in `app/main.py`: outside dev, the built-in `docs_url`/`openapi_url`/`redoc_url` are disabled and replaced with `register_protected_docs()`, which registers `/docs` and `/openapi.json` explicitly calling `require_auth(request)` (same convention as every other protected route). `/redoc` has no protected replacement and stays disabled outside dev.
- [x] 5.3 Add an Origin/Referer allowlist check for unsafe methods (`POST`/`PUT`/`PATCH`/`DELETE`) on authenticated routes, comparing against `settings.app_url`; reject with 403 on mismatch (per design.md Decision 4).
- [x] 5.4 Add a `core_api_csrf_rejections_total` counter labeled by `path`, incremented on Origin/Referer mismatch.
- [x] 5.5 Add unit tests: a path sharing a prefix with a public path now requires auth; `/docs`/`/openapi.json` public in dev env, auth-required in non-dev env; `/metrics` remains public in both dev and non-dev; a POST/PUT/PATCH/DELETE with a mismatched Origin is rejected; same-origin requests succeed unchanged. Also added HTTP-level tests (`test_docs_and_openapi_reject_unauthenticated_requests_outside_dev`, `test_docs_and_openapi_serve_authenticated_requests_outside_dev`) exercising the real registered routes end-to-end, since the path-matching tests alone wouldn't have caught the enforcement gap described in 5.2.
- [x] 5.6 Run `just validate-backend` and `uv run pytest` (scoped to middleware tests) — both pass.

## 6. Full validation and verification

- [x] 6.1 Run `just validate-backend` for the full `services/core-api` tree.
- [x] 6.2 Run the full `uv run pytest` suite and confirm no regressions.
- [x] 6.3 Start the compose stack (`docker compose -f infra/compose/docker-compose.yml up -d`) and manually verify: local media upload/serve requires login; a normal upload → confirm flow still works end-to-end from the web app; `/docs`/`/openapi.json` are gated outside dev while `/metrics` stays reachable unauthenticated; a same-origin mutating request (e.g. creating a story) still succeeds from the web app.
- [x] 6.4 Record what was observed during manual verification in the PR description.

### Manual verification observations (6.3/6.4)

Verified against the running local compose stack (`core-api` restarted to pick up the code changes — the container runs `uvicorn` without `--reload`, so the bind-mounted source alone wasn't enough). `ENV=dev`, `STORAGE_BACKEND=s3` (real S3-compatible endpoint, not localstack) in this stack, using a real Keycloak-authenticated dev user (`hewjoe@m5.build-it.xyz`) and their existing legacy for authenticated checks.

- **Local media auth (12a):** `GET /media/local/somefile.jpg` and `PUT /media/somefile.jpg` without a session cookie both returned `401 Unauthorized`, with `media.local_serve_denied` / `media.local_upload_denied` logged. With a valid session cookie, the routes correctly passed the auth check and then hit the `storage_backend != "local"` → 404 branch (expected, since this stack is configured for S3, not local storage — the traversal-guard specifics are covered by the added unit tests instead, since they're unreachable in this environment's config).
- **S3 upload → confirm flow with size verification (12c):** requested a presigned upload URL for a 68-byte PNG, `PUT` the real bytes to the presigned S3 URL (200 OK), then `POST /api/media/{id}/confirm` — response showed `"size_bytes": 68`, confirming the value came from the storage-verified `head_object` call (`get_file_size`) rather than the client-declared size. Cleaned up via `DELETE /api/media/{id}` afterward.
- **`/docs` and `/metrics` in dev (12f):** both remain reachable unauthenticated (`200`) in this dev-env stack — correct, unchanged behavior. The env-gated-outside-dev behavior itself (the actual new behavior) can't be exercised in this dev stack without reconfiguring it to a non-dev env; it's covered by the new HTTP-level tests in `tests/test_request_security.py` (`test_docs_and_openapi_reject_unauthenticated_requests_outside_dev` / `..._serve_authenticated_requests_outside_dev`), which build a standalone app instance with `env="production"` and hit the real registered routes.
- **CSRF / same-origin mutating request (12g):** `POST /api/stories` with a mismatched `Origin: https://evil.example.com` returned `403 Forbidden` with `session.csrf_rejected` logged (`path`, `origin_or_referer`). The same request with the correct `Origin` (matching `settings.app_url`) succeeded (`201 Created`), proving the CSRF check doesn't break legitimate same-origin requests. Cleaned up the created story via `DELETE /api/stories/{id}`.
- **Bug caught during verification (see 5.2 above):** initially, excluding `/docs`/`/openapi.json` from `SessionMiddleware`'s public-path set had no actual effect outside dev, because the middleware only records `request.state.authenticated` — it never rejects a request itself, and FastAPI's built-in docs routes never call `require_auth()`. Fixed in `app/main.py` by disabling the built-in `docs_url`/`openapi_url`/`redoc_url` outside dev and registering explicit replacement routes that call `require_auth(request)`, matching the convention used by every other protected route. A first version of the new test for this also passed for the wrong reason (FastAPI's own unprotected defaults were shadowing the protected replacement routes in the test app) until the test app was constructed with `docs_url=None` etc., matching `app.main`'s actual construction.
