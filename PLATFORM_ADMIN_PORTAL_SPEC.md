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

## Admin Worker source prepared (not deployed)

`cloudflare-admin-worker/index.mjs` implements only `/internal/admin/session` with injected Supabase Auth verification and privileged allowlist lookup. No Wrangler file, domain, deployment or frontend route has been created. **Production blocker:** privileges on `subscription_platform_admins` are revoked even from `service_role`, so the draft Worker will fail closed until a separately reviewed least-privilege lookup mechanism is designed. Do not grant general table privileges merely to activate this draft. No admin has been appointed. CI tests use mocked responses and do not prove production database access.

## Trusted identity boundary

The unmounted session handler now rejects userId, actorId and adminId query parameters, and obtains actor identity only from trusted token verification. This is defense in depth, not an authorization substitute. The lookup function must also reject all externally supplied user IDs, and production access remains blocked until a reviewed execution principal exists. No admin endpoint has been deployed.

## Disposable database lookup test

`tests/licensing-postgres-admin-lookup.sql` and the disposable PostgreSQL GitHub workflow now test a dedicated execution role, denied browser role, positive membership, negative membership, and read-only behavior. This test deliberately models a narrow executor, rather than changing the production `subscription_platform_admins` privileges. It does not deploy `platform-admin-lookup-proposal.sql` or activate the Cloudflare administrator Worker. The tests use disposable test identities only; a real trusted token-to-user identity binding and carefully reviewed production grants are required before deployment.

## Private membership service binding (source only)

The unmounted `cloudflare-admin-worker/index.mjs` now uses `ADMIN_MEMBERSHIP_SERVICE.fetch` and **does not read `subscription_platform_admins` directly** or require a Supabase service-role credential. Missing service binding fails closed. The private membership service is not implemented or deployed and must verify the calling Worker's authority, bind the membership subject to the verified identity, and return a boolean only. A service binding by itself does not prove caller identity to the membership service. Existing production table privileges remain untouched. Mocked unit tests validate failure paths, not live identity binding or grants.

## Private membership service implementation (still unmounted)

`cloudflare-admin-worker/private-membership.mjs` now contains an isolated request handler that independently verifies the supplied bearer token, compares its verified user ID against the claimed ID, and asks an injected least-privilege membership adapter for a boolean only. The administrator Worker forwards the bearer proof over its future private Cloudflare service binding; no tokens are logged. Tests cover identity mismatch, invalid/missing authentication, nonmembership, and upstream failure. **Do not deploy as a public HTTP endpoint**. Before rollout, enforce private service-binding ingress, add a real independently verified Supabase Auth adapter and a vetted, minimal privilege database lookup; no such production adapters or grants are included here.
