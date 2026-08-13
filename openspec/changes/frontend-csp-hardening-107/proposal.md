## Why

An automated security review (GitHub issue #107) found a bundle of low-severity frontend hardening gaps: the production CSP whitelists a dev-only host, HSTS is not emitted anywhere (nginx or edge), and three lower-risk items (a `dangerouslySetInnerHTML` chart helper, a write-only `auth_return_url` value with no reader yet, and MSW's mock worker file shipping in the production bundle) need documentation or a small build fix so they don't regress into real vulnerabilities later.

## What Changes

- Remove the dev host `https://s3.m5.build-it.xyz` from the production CSP (`img-src`, `connect-src`) in `apps/web/nginx.conf` — it matches the personal dev domain used in `vite.config.ts`'s dev-server `allowedHosts`/CSP, not a production asset host.
- Add a `Strict-Transport-Security` header in `apps/web/nginx.conf` (top-level and both nested locations that currently re-declare security headers), since neither nginx nor the ALB ingress currently emits one.
- Add a one-line trust-boundary comment on `ChartStyle` in `apps/web/src/components/ui/chart.tsx` documenting that `dangerouslySetInnerHTML` is safe only while `ChartConfig` stays developer-authored.
- Add a one-line comment at both `sessionStorage.setItem('auth_return_url', ...)` call sites (`AuthContext.tsx`, `InviteAcceptPage.tsx`) documenting the same-origin validation (`^/(?!/)`) required of any future reader, since no consumer exists yet and the OAuth callbacks currently always redirect to a fixed `{app_url}/app`.
- Exclude `mockServiceWorker.js` from the production Vite build output via a `closeBundle` step in `vite.config.ts`, confirming MSW's `worker.start()` is never called outside tests/Storybook.

## Capabilities

### New Capabilities
- `frontend-security-headers`: Production CSP and HSTS requirements served by the web app's nginx layer (dev-only hosts must not appear in the production CSP; HSTS must be emitted since no upstream edge does).

### Modified Capabilities
(none — no existing spec covers these requirements)

## Impact

- `apps/web/nginx.conf` — CSP directive values (3 occurrences), new HSTS header (3 occurrences).
- `apps/web/vite.config.ts` — production build step.
- `apps/web/src/components/ui/chart.tsx` — comment only, no behavior change.
- `apps/web/src/contexts/AuthContext.tsx`, `apps/web/src/features/members/components/InviteAcceptPage.tsx` — comment only, no behavior change.
- No backend, API, or schema changes. No new dependencies.

## Non-goals

- Removing `style-src 'unsafe-inline'` from the CSP (requires a nonce/hash migration for the shadcn chart component; tracked as future follow-up, not in this change).
- Implementing the `auth_return_url` read side / post-login redirect (would require backend OAuth callback changes to thread a return path through `state`; out of scope for this low-severity bundle).
- Verifying or configuring HSTS at the ALB/edge layer (infra/CDK change, out of scope here — this change only ensures nginx emits it so the app is protected regardless of edge config).

## Open Questions

- None — all five items have a confirmed root cause and a bounded fix; no human decision points remain before implementation.
