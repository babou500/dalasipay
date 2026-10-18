# Issue 94 verification and release gate

This draft is stacked on PR #93 (`55bb79903e13cf4f9125344e0e678085b1542bf5`). Preserve that PR's supplier/account quick-create, unfinished journals and receipt improvements. Neither PR is merged by this work.

## Cause and changes

The expense/PO handlers mutated local arrays, queued the general workspace save and reported success before the revisioned backend acknowledged persistence. Required cash-account validation also blocked draft expense submission in the rendered browser. These paths now stage changes separately, lock duplicate submissions and publish success only after one acknowledged compare-and-swap transaction. Offline, rejected, stale and cross-workspace writes retain the form and attachment instead of creating a phantom saved record. Existing remote collections remain in the saved snapshot.

Buy on credit reuses supplier bills and Accounts Payable, with supplier invoice, due date, payment terms, VAT, discounts, dimensions and a planned initial payment. A plan is not a payment. Drafts do not post. PO receiving and PO-to-bill linkage remain separate, preventing stock/AP duplication. Approved liabilities, independently approved partial settlements, exact cash linkage and controlled reversals use the existing ledger. Mixed line VAT preserves receiving-clearing amounts. No separate purchasing ledger was introduced.

The unapplied migration `20261016231950_procurement_state_integrity.sql` guards the existing workspace RPC against bypassing financial permissions, ownership, approval, duplicate reference, closed-period, overpayment and paid-record controls. Procurement state and append-only server audit events commit or roll back together. The guard is AFTER INSERT/UPDATE so an INSERT ON CONFLICT CAS does not incorrectly revalidate existing paid records as new drafts. New approvals require verified user IDs; legacy pending records without trustworthy maker identity require an explicit staging compatibility review, not inferred identity from a display name.

## Executed checks, 17 October 2026

- 369 Node regression/security/Worker tests passed, zero failures/skips.
- 32 disposable PostgreSQL (PGlite) tests passed, including the actual migration and mirrored deployed CAS/RLS contract, rollback, tenant/HR isolation, independent approvals, partial payment, immutable paid records, exact cash reversal and audit immutability.
- Six Chromium/Playwright tests passed. Isolated HTTP fixtures verify conflict/error retention, attachment retention, acknowledgement, reload, credit bill creation and all four PR #93 quick-create/draft preservation scenarios. The Browser plugin is unavailable; regular Playwright was used. These are not authenticated staging acceptance.
- All four existing Wrangler configurations passed `node scripts/cloudflare-release.mjs dry-run` using locked Wrangler 4.149.0. No deployment command was run.
- `git diff --check` passed.
- Read-only live Supabase verification: 15 subscription rows, including 13 Professional Preview rows and two Free rows; billing remains disabled. The full-row checksum before and after is `9ca1fb296eff080e6b8a73b82e4fc29e`, calculated as `md5(string_agg(to_jsonb(s)::text, '' order by organization_id))`. No production data, subscription or migration was written.

## Mandatory acceptance before merge/deployment

1. Complete PR #93 review, then rebase/retarget this stacked draft and rerun required GitHub checks on the final combined main candidate.
2. Apply the proposed migration only to an authorized disposable/staging Supabase database matching the deployed schema. Test historical pending/received/paid documents and unrelated workspace saves, including HR saves that do not change procurement collections. Do not run a blanket migration push against production.
3. Provide an authenticated non-production workspace with distinct authorized maker/checker accounts. Verify acknowledged expense and PO saves after reload/sign-out/sign-in, existing supplier quick-create and journal/receipt flows, credit bill approval, partial/final settlement, receiving clearing, aging/statements, reversals and reconciliation/trial balance. Verify denied viewer/HR/cross-tenant writes, stale/offline failures and duplicate requests against the real staging RPC.
4. Record the acceptance evidence and obtain the existing protected release approval. Only then schedule the reviewed migration and exact verified Worker release through the established protected deployment procedure; retain the prior Worker version and database backup. A failed acceptance means no release. Do not drop audit history or blindly reverse the migration as a rollback.

Authenticated staging for this exact candidate has not been exercised. The production app is deliberately unchanged. Billing activation, subscription restrictions and customer record migration are outside this change.

## Free local verification, 18 October 2026

No dedicated DalasiPay staging project was available among the existing projects. Docker and native PostgreSQL are absent on this computer. No paused/unrelated project was resumed or repurposed; no paid branch, project or resource was created. Following the owner's instruction, all new database writes use fictional local data only. The production Supabase database was not queried or modified in this follow-up.

Added a loopback-only authenticated test server backed by the existing pinned PGlite runtime. It uses random in-memory signing material, fictional users and HttpOnly test-session cookies. It verifies session signatures/expiry and passes the verified local subject into PostgreSQL RLS. This is test infrastructure, not a replacement for Supabase Auth or Cloudflare Access. Browser network access is restricted to that local server.

The browser now exercises the actual expense/credit-bill UI and production persistence adapter against the real migration, RLS and CAS RPC, followed by actual payment module operations: independent maker/checker approvals, partial and final settlement, duplicate cash prevention, balanced journals/AP, retained audit, denied HR/outsider writes, invalid/expired sessions, logout and fresh sign-in/readback. Added historical paid/received record compatibility tests, including unrelated HR saves and rejection of unverifiable legacy approvals.

This exposed a real jsonb integration defect masked by the prior in-memory HTTP fixtures: object key reordering made the client mistake an unchanged record for a conflict. The optimistic snapshot comparison now ignores object key order, including nested objects, while retaining array order, value checks and revision checks. Dedicated regression coverage verifies that genuine nested edits still conflict.

Local commands (PowerShell, with Node on PATH and the existing Playwright runtime configured):

```powershell
$env:PGLITE_MODULE=(Resolve-Path tests/admin-auth-runtime/node_modules/@electric-sql/pglite/dist/index.js).Path
node --test master-data-persistence.test.js procurement-persistence.test.js
node --test tests/admin-bootstrap.postgres.test.mjs tests/licensing-management.postgres.test.mjs tests/procurement-state.postgres.test.mjs
node --test tests/master-data-forms.browser.cjs tests/procurement-authenticated-local.browser.cjs
node scripts/cloudflare-release.mjs dry-run
```

The GitHub browser job installs both locked PostgreSQL dependencies and the pinned Playwright runtime and runs these browser tests without credentials. Full regression checks remain part of the existing safety workflow. The protected deployment workflow is unchanged.

Hosted Supabase authentication, a deployed non-production RPC and authenticated Cloudflare staging acceptance remain unverified. Local signed test sessions do not satisfy those checks. A full local Supabase stack would require a functioning container runtime; alternatively, a dedicated free hosted staging project could be used if available. No paid resource is necessary for the completed tests, and no paid resource has been authorized or created. The original no-merge/no-production-release gate remains in force.

Final local results for this follow-up: **370/370** Node regression/security/release tests, **33/33** PostgreSQL tests, **7/7** browser tests, **4/4** Worker dry runs; no failures or skipped tests. The expected local HR/outsider PostgreSQL rejections in the browser log are negative authorization checks, not application failures. `git diff --check` passed.
