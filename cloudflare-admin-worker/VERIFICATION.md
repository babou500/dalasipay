# Actual verification — 2026-10-09 UTC

## Source and deployed cause

Inspected repository base `ec5576dd598d03ef2e593572eda047817cda1d96`, both deployed
Worker source files, bindings and URL configuration, and live Supabase catalogs.
The live private binding returned 503 `token_verification_service` for a synthetic
untrusted token whose claims reached key retrieval. The exact deployed code in
local Cloudflare workerd reproduced the unsupported `redirect:'error'` exception.
Replacing it with manual redirects returned the expected 403. The deployed live
binding also returned 403 after the fix. No real operator token was logged or used
for those negative tests, and the synthetic token grants no access.

## Executed tests

| Verification | Actual result |
| --- | --- |
| Administrator Node regression/integration tests | 66 passed, 0 failed, 0 skipped |
| PostgreSQL bootstrap/permissions/audit rollback/two-Worker flow | 5 passed, 0 failed, 0 skipped |
| Existing licensing/subscription regression suite | 87 passed, 0 failed, 0 skipped |
| Both Wrangler deployment dry-runs | Passed |
| Exact deployed code on workerd, before fix | 503, unsupported redirect mode reproduced |
| Corrected code on workerd | 403 for untrusted signing key |
| Actual private production binding, before/after | 503 before; 403 after for the same untrusted-key scenario |
| Signing-key endpoint | HTTP 200, two RSA keys |
| Fresh unauthenticated staging request after deploy | HTTP 302 to the configured Access tenant |
| Live positive real-operator Access → membership → dashboard | **Not completed** |

PostgreSQL tests use isolated fixtures and actual SQL permissions, not a production
appointment. They demonstrate atomic rollback when the audit insert fails, exact
subject authorization, denial of browser RPC execution and roster access, duplicate
bootstrap rejection, and revocation. They do not test concurrent independent
PostgreSQL connections or real Supabase HTTP transport.

## Live Supabase review

The function `public.platform_admin_identity_authorized_internal(text)` is STABLE,
SECURITY DEFINER, with search path pinned to pg_catalog/public, and returns only
EXISTS over approved exact-subject mappings joined to platform administrators.
EXECUTE is granted to postgres/service_role, denied to anon/authenticated.
Service_role cannot directly SELECT either administrator table and can SELECT
workspace subscriptions. Browser roles cannot SELECT those tables/subscriptions.
An unknown subject returned false. No function, role grant, policy, migration,
administrator, mapping, or subscription was changed on Supabase.

After deployment: 13 subscriptions, 13 Professional Preview rows, 0 administrators,
0 identity mappings, 0 audit events. Preview and existing subscriptions remain
unchanged. No accounting or payroll files were edited.

## Deployment audit

| Existing Worker | Deployed version | Previous version |
| --- | --- | --- |
| dalasipay-admin-auth-private | 6f551963-6ede-49ca-b86b-77c419bfa2ce | 61a63821-80f6-4eb1-96d4-91255da45e17 |
| dalasipay-admin-staging | cabf9e66-fbc9-4df7-85f7-e42101e95369 | 318d4f05-08c6-4d20-8662-1e35dc1e2fbd |

Post-deployment API checks confirmed the production service binding, preserved
private secrets/variables, staging workers.dev enabled with previews disabled,
and private workers.dev and preview URLs both disabled. Only these existing
Workers were deployed. No additional permanent Worker, Access bypass, billing,
plan enforcement, or database permission was introduced.

The remaining positive live test requires a real Access session, independently
verified subject/account evidence, and the separately approved first appointment.
The Codex browser remained on Cloudflare's loading screen; a CLI OAuth refresh
provided deployment access but does not establish a dashboard Access session.
See README.md for one deployment and bootstrap procedure. Do not treat deployment
or identityMatched:true alone as proof of operational administrator access.
