## Context

Issue #107 is a bundle of five low-severity findings from an automated frontend security review. Two of them (stale dev host in prod CSP, missing HSTS) are simple config corrections to `apps/web/nginx.conf`. The other three (chart `dangerouslySetInnerHTML`, `auth_return_url` write-only value, MSW worker file in the prod bundle) were already confirmed safe today; the work is a documentation comment for two of them and a small build-output fix for the third. No schema, API, or auth-flow changes are involved.

## Goals / Non-Goals

**Goals:**
- Remove the non-production host from the CSP so the allowlist matches only real production origins (`*.amazonaws.com`, `*.googleusercontent.com`, self).
- Ensure the browser receives `Strict-Transport-Security` regardless of what the ALB/edge does, since nothing upstream currently sets it.
- Leave a durable trail (code comments) at the two "safe today, could regress" call sites so future edits don't silently reintroduce a vulnerability.
- Stop shipping the MSW mock worker script in the production bundle.

**Non-Goals:**
- Migrating `style-src` off `'unsafe-inline'` (needs a nonce/hash strategy for the shadcn chart component — separate future change).
- Implementing a reader for `auth_return_url` / threading a return path through the OAuth `state` parameter on the backend.
- Configuring HSTS at the ALB/CloudFront/edge layer (infra change, tracked separately if the edge is later confirmed to need it too).

## Decisions

- **CSP host removal**: Delete `https://s3.m5.build-it.xyz` from all three duplicated CSP `add_header` lines in `nginx.conf` (top-level, static-asset location, `index.html` location). No alternatives considered — it's dead config matching a personal dev domain (`vite.config.ts` dev server `allowedHosts`), not used by any production S3 bucket reference elsewhere in the repo.
- **HSTS emission point**: Add `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` at the nginx layer rather than waiting to verify the ALB, since (a) ALB does not support arbitrary response-header injection natively today (no annotation found in `infra/helm/mosaic-life/values*.yaml`), and (b) emitting it in the app's own response is unconditionally correct and cannot conflict with an edge that might add it too (browsers just take the strongest policy). Match the existing pattern of repeating security headers in the two nested `location` blocks (nginx doesn't inherit `add_header` into nested locations once any `add_header` is set there).
- **Chart/`auth_return_url` comments**: One-line comments, not code changes — adding validation logic with no caller would be dead code (flagged by the issue itself as "no action required now" / "when implementing the consumer"). A comment is the lowest-cost way to prevent the safe-today assumption from being silently violated later.
- **MSW exclusion**: Use a Vite `closeBundle` plugin hook to delete `mockServiceWorker.js` from the `dist/` output after build, rather than moving the source file out of `public/` (which would require updating `msw.workerDirectory` in `package.json` and `MSW init` tooling used by tests/Storybook). Keeping the source in `public/` preserves the existing test/Storybook setup; the plugin only prunes the production build artifact. The hook is unconditional (runs on every `vite build`) since that command is only ever used to produce the production Docker image.

## Risks / Trade-offs

- [Risk] Removing `s3.m5.build-it.xyz` breaks something if it actually is a real asset host reachable from production] → Mitigation: grepped the repo; the host only appears in `nginx.conf` and the dev-only `vite.config.ts` CSP/`allowedHosts`, never in Helm values, CDK, or env templates for prod. Verify by loading the production site after deploy and checking the browser console for CSP violations.
- [Risk: `closeBundle` deletion silently no-ops if the output path changes] → Mitigation: keep the delete guarded with an existence check (no-op, not an error, if the file is already absent) and confirm removal manually via `npm run build && ls dist/mockServiceWorker.js` (expect "No such file").
- [Risk: HSTS `preload` directive is effectively irreversible once submitted to browser preload lists] → Mitigation: we are only emitting the header, not submitting to the HSTS preload list; `preload` in the header value alone has no effect until a submission is made, so this stays reversible by simply changing/removing the header.

## Migration Plan

No data migration. Deploy is a standard image rebuild + Helm/ArgoCD rollout of the `web` service. Rollback is a plain revert of the nginx.conf/vite.config.ts changes and redeploy — no feature flags needed given the low blast radius.

## Telemetry

No new OTel spans/metrics/logs — this is static nginx config and a build-time step, not a runtime code path.

## Open Questions

None.
