# Actual verification - 2026-10-09 UTC

## Outcome

The authorized sole owner is now the first DalasiPay platform administrator.
Authenticated infrastructure checks and live Supabase facts established repository
admin access, the Cloudflare account, a confirmed active Auth account, organization
creation, and exactly one BE Business Solutions member with role owner.
The official Cloudflare client completed interactive Access sign-in. The shared
Worker verifier validated the actual JWT signature against current issuer keys,
pinned issuer/audience, expiry, and the verified owner email before using its `sub`.
No login-log ID or matching email was used as authority to appoint.

The reviewed `bootstrap-owner.sql` executed as postgres and committed one membership,
one approved exact-subject mapping, and one `platform_admin_appointed` audit event
atomically. Audit event 1 records `single_owner_initial_bootstrap`, the owner's
explicit authorization reference, verified identity evidence without a token,
trusted ownership facts, and the consumed marker. Actor and target honestly identify
the owner; no fictitious approver is recorded. A live repeat of the same procedure
was rejected: `Owner bootstrap already consumed or administrator state is not empty`.
Post-rejection counts remain one administrator, one mapping, one appointment.

## Actual live end-to-end checks

The signed session was submitted as an Access cookie to the real staging URL;
Access supplied the assertion, staging called its production private binding,
and the private Worker consulted real Supabase authorization/subscription data.

| Check | Actual result |
| --- | --- |
| Before appointment: actual signed owner session authorization | HTTP 403, authorized false |
| Actual signed subject identity match | HTTP 200, identityMatched true |
| After appointment: authorization | HTTP 200, authorized true |
| Real read-only subscriptions endpoint | HTTP 200, 13 rows, all 13 Professional Preview |
| Dashboard HTML | HTTP 200, 13 subscription table rows and 13 Unlimited cells |
| No Access session at subscriptions endpoint | HTTP 302 to Access |
| Unknown unappointed subject in live restricted RPC | false |
| Second live owner bootstrap attempt | Rejected; counts unchanged |
| Full subscription data checksum before/after appointment and replay | Identical |
| Private workers.dev and preview URLs | Both disabled |
| Staging production binding | ADMIN_MEMBERSHIP_SERVICE -> dalasipay-admin-auth-private |

This is an actual authorized HTTP end-to-end test with the owner's signed Access
session and live services. Dashboard HTML was inspected and counted; a visual
browser rendering was not inspected because the Codex browser blocks this host.
No second person's real session was supplied. Unauthorized-subject coverage also
includes the live pre-appointment signed-session denial, the unknown-subject RPC,
the earlier live invalid-signing-key rejection, and signed unmapped test fixtures.

All 13 existing subscriptions remain unchanged, including full row data. Professional
Preview stays unlimited. No billing, plan restrictions, payroll, or accounting change
was made. Temporary raw-token files and newly created client token caches are removed
after verification; only safe evidence and outcomes are retained privately/in audit.

## Executed tests

| Suite | Result |
| --- | --- |
| Administrator Node regression/integration | 68 passed, 0 failed, 0 skipped |
| Actual PostgreSQL bootstrap/permissions/audit/two-Worker integration | 10 passed, 0 failed, 0 skipped |
| Existing licensing/subscription regression | 87 passed, 0 failed, 0 skipped |
| Total | 165 passed |
| GitHub CI for owner-bootstrap implementation | Passed, run 37870612311 |
| Both original Wrangler deployment dry-runs | Passed |

PostgreSQL tests use PGlite fixtures and an in-process HTTP adapter, not production
appointments. They cover sole ownership, confirmed active accounts, fresh signed
identity evidence, rollback on audit failure, denied service-role execution, and
replay through both bootstrap scripts after revocation. Two cryptographic tests
prove use of actual signed subject distinct from a login-log ID and reject wrong
owner/audience/expiry/signature. Concurrent independent PostgreSQL connections were
not exercised. Live checks above separately verify real Access, Workers, and Supabase.

## 503 cause and deployment audit

The deployed private Worker used `redirect:'error'` while fetching signing keys.
Cloudflare workerd rejects that redirect mode. Exact deployed code reproduced the
exception locally; the real private binding returned 503 before the fix and 403
for the same untrusted-key scenario after deployment. Manual redirects with explicit
non-success rejection fix the error while preserving validation.

| Existing Worker | Deployed version | Previous version |
| --- | --- | --- |
| dalasipay-admin-auth-private | 6f551963-6ede-49ca-b86b-77c419bfa2ce | 61a63821-80f6-4eb1-96d4-91255da45e17 |
| dalasipay-admin-staging | cabf9e66-fbc9-4df7-85f7-e42101e95369 | 318d4f05-08c6-4d20-8662-1e35dc1e2fbd |

The existing deployment immediately served the authorized real dashboard after
appointment; no further Worker deployment or additional Worker was needed.
Private URLs remain disabled and Access remains required. Existing secrets were
preserved and never exposed. The restricted SECURITY DEFINER function has a pinned
search path and exact-subject approved mapping lookup; anon/authenticated cannot
execute it and service_role cannot read the administrator roster. No function,
role grant, policy, or migration was changed for the owner appointment.

See README.md for the controlled procedure and code rollback. Bootstrap is now
consumed; any later appointment or revocation requires a separately authorized,
audited administrative transaction and cannot reuse the initial bootstrap.
