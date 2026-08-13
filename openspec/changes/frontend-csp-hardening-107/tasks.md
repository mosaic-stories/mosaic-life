## 1. CSP hardening (nginx.conf)

- [x] 1.1 Remove `https://s3.m5.build-it.xyz` from the `img-src` and `connect-src` directives in all three CSP `add_header` lines in `apps/web/nginx.conf` (top-level, static-asset location, `index.html` location).
- [x] 1.2 Add `add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;` next to the other security headers in `apps/web/nginx.conf`, in the top-level `server` block and both nested `location` blocks that currently re-declare security headers.
- [x] 1.3 Manually verify: rebuild the web image (or run nginx locally against the config) and confirm the CSP no longer references `s3.m5.build-it.xyz` and that `Strict-Transport-Security` is present on a response.

## 2. Documentation-only trust-boundary comments

- [x] 2.1 Add a one-line comment above `ChartStyle` in `apps/web/src/components/ui/chart.tsx` noting that `dangerouslySetInnerHTML` is safe only while `ChartConfig` values stay developer-authored (not user/API data).
- [x] 2.2 Add a one-line comment at the `sessionStorage.setItem('auth_return_url', ...)` call in `apps/web/src/contexts/AuthContext.tsx` documenting the same-origin validation (`^/(?!/)`, else fall back to `/`) required of any future reader.
- [x] 2.3 Add the same one-line comment at the `sessionStorage.setItem('auth_return_url', ...)` call in `apps/web/src/features/members/components/InviteAcceptPage.tsx`.

## 3. Production bundle: exclude MSW mock worker

- [x] 3.1 Confirm (already verified during planning, re-check if code has changed) that no `worker.start()` call exists outside test/Storybook setup files.
- [x] 3.2 Add a small `closeBundle` plugin hook in `apps/web/vite.config.ts` that removes `dist/mockServiceWorker.js` after a production build, as a no-op if the file is already absent.
- [x] 3.3 Run `npm run build` in `apps/web` and confirm `dist/mockServiceWorker.js` does not exist; confirm the existing `dist/` app still loads (spot check `index.html` present, no build errors).

## 4. Validation gate

- [x] 4.1 Run `just validate-frontend` and confirm it passes.
- [x] 4.2 Drive the affected flow in the running compose stack: load the app, open browser devtools, confirm no CSP violation errors in the console and that the CSP/HSTS headers match the updated config (`docker compose -f infra/compose/docker-compose.yml up -d web` then inspect response headers).
- [ ] 4.3 Open a PR referencing GitHub issue #107 and this OpenSpec change (`frontend-csp-hardening-107`).
