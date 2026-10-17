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
