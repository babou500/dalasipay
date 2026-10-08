# DalasiPay licensing: Cloudflare integration gate

Updated 2026-10-08. This document records the verified integration boundary on GitHub `main`.

## Verified repository findings
- The repo currently contains a static `index.html` application and root-level assets.
- No `wrangler.toml`, `wrangler.jsonc`, `_worker.js`, `functions/`, or `api/` backend entrypoint is present in the tracked tree (79 paths at inspection).
- Application backend configuration in `index.html` references Supabase, via `DalasiBackend` and `DalasiProduction`. Cloudflare hosting should not be confused with the data/auth backend.
- Older `licensing.js` and `licensing.css` are tracked but not loaded by `index.html`; do not reactivate them.
- `licensing-observer-core.mjs` and `cloudflare-licensing-observer.mjs` are isolated modules and are not mounted on a live route.
- Current subscription settings remain UI-only; legacy development workspaces display Professional Preview without enforcement.

## Required gate before backend integration
1. Confirm actual Cloudflare Pages/Workers project and deployed entrypoint, including build and deploy pipeline.
2. Confirm authenticated principal identity, server-side workspace membership validation, and organization isolation. Never rely on browser-provided role, plan, or usage count.
3. Confirm authoritative subscription storage, durable migration rules, and server-side monthly usage accounting (UTC month or documented billing timezone). Preserve existing workspaces as Professional Preview.
4. Add a separate authenticated GET endpoint that returns observation-only usage data and `enforcementActive:false`. Do not block operations or require the observer during startup.
5. Test unauthenticated, cross-workspace, missing datastore, failed network, Professional Preview, and mobile login/dashboard scenarios in staging.
6. Only after these tests should any enforcement be considered. Changes to invoice/payroll/accounting handlers require separate review and server-side atomic checks.

## Non-goals for this phase
No automatic subscription activation, no billing, no enforcement, no new network request during application startup, no change to login or accounting code.

## Regression commands when the repository is cloned
`node --test licensing-policy.test.js workspace-subscription.test.js subscription-plan-view.test.js subscription-usage.test.js cloudflare-licensing-observer.test.mjs`

Note: these tests cover isolated modules; they do not prove Cloudflare deployment behavior or server authentication.
