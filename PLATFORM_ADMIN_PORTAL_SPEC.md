# DalasiPay Platform Administrator Portal — secure foundation

Status: DESIGN CONTRACT ONLY. No live route, login page, or administration API is deployed.

## Separate deployment boundary
- Host the future operator portal as a separately configured Cloudflare Worker with an independent hostname. Do not embed this portal in the customer DalasiPay app.
- Never ship Supabase service-role keys, subscription mutation functions, or administrator lists to the browser.
- Browser pages are not an authorization boundary; all portal API handlers must verify the Supabase Auth session and separately check membership in the protected `subscription_platform_admins` allowlist.
- Reject unauthenticated or non-platform operators before reading tenant metadata. A customer organization Owner is not a platform administrator.

## Read-only first release
- Operator dashboard: counts of pending requests and open reviews, derived server-side only.
- Review queue: minimum necessary tenant labels, target plan, status, created date; paginated and scoped to authorized platform operators.
- Audit history: append-only events with limited redacted metadata.
- Operator access: display membership but do not allow appointment or revocation until independently approved and audited controls are operational.

## API contract (future, NOT deployed)
- GET /internal/admin/session — return only `{authorized:boolean}` after verified auth and platform-admin check.
- GET /internal/admin/requests — authorized, paginated, read-only.
- GET /internal/admin/audit — authorized, paginated, read-only.
- No POST/PATCH/DELETE routes in the initial release.

## Security and rollout gates
- Deny by default; no public caching, access-control-allow-origin limited to the dedicated operator hostname; no browser credential/token logs.
- Explicit server-side schema allowlist and pagination; sanitize displayed content, CSRF defense for any future mutations.
- Security tests: no token, forged token, company owner but not operator, cross-tenant data exposure, token expiry, role revocation, response cache headers.
- Establish an independently approved first operator before deploying a restricted working portal. Until then, leave the portal unmounted.
- Keep existing Professional Preview and accounting functionality unchanged.
