# Annual pricing and disabled billing foundation — 2026-10-09

Approved catalogue: Free D0, Standard D12,500/year, Professional D25,000/year. Currency GMD; annual only, 12 months. Prices are read from existing Supabase pricing drafts, never hardcoded into customer pricing displays.

## Implemented
- Main Settings → Subscription & Plans uses its existing Supabase session/RPC to display authoritative prices, features, limits, unlimited Preview status, requests and tenant-scoped billing history.
- Existing standalone customer portal displays the same authoritative annual catalogue after its own existing sign-in.
- Administrator plan drafts display prices, a feature comparison, and separately confirmed price edits with reason, version checking, server authorization and immutable audit. No production price edits were performed.
- Read-only administrator Billing page; empty ledger is displayed honestly.
- Separate subscription ledger for annual invoice/receipt numbering, price/business/period snapshots, payment records, pending/paid/unpaid/overdue status, optimistic concurrency, receipt/audit immutability, and 30/14/7-day reminder dates. Transaction failures roll back ledger writes and audit together; numbering sequences may have gaps after rollback.
- Escaped A4 print / browser Save as PDF document renderer prepared and tested. It has no public route and does not issue bills.

## Migration
Applied only `20261009154244_annual_billing_foundation.sql` (Supabase-generated version). The previously applied pricing migration was not re-run, and approved prices/draft versions were not overwritten. Existing pricing SQL file timestamp differs from its already-applied remote version 20261009152200; this pre-existing discrepancy was left untouched.

Billing controls include an enforced CHECK(enabled=false). Mutation workflows additionally require an active mapped platform administrator. Workers expose no invoice/payment mutation actions. Future activation requires explicit owner authorization, a reviewed forward migration and additional application routes. There is no payment provider, automatic debit, reminder sender, expiry enforcement or entitlement write.

## Verification
- Node suite: 173 passed, zero failed/skipped.
- PostgreSQL integration suite (PGlite): 22 passed, zero failed/skipped. Covers signed-subject Worker-to-PostgreSQL authentication, bootstrap invariants, ownership/session checks, self-review denial, pricing authorization/version/audit rollback, disabled billing gate/raw grants, and disposable invoice/payment/receipt/reminder workflows with tenant isolation and unchanged subscription snapshots.
- Cloudflare dry runs: all four existing Workers passed.
- Live authenticated main application: BE Business Solutions name and original workspace, three correct prices, plan features, Unlimited Professional Preview, preserved cancelled renewal request and empty billing history verified.
- Live Access-authenticated administrator: prices, feature comparison and empty disabled billing overview verified. No live forms were submitted.
- Standalone portal deployed; public sign-in page verified separately. Its newly rendered catalogue has not been checked in a signed-in standalone session (customer previously deferred that separate sign-in).
- Before and after migration: 13 subscriptions / 13 Professional Previews; complete-row checksum `16d01b4bd7d59de8ae4df5dcec963e60`. Approved price versions remain Free 3, Standard 2, Professional 2. Production invoices/payments/reminders: zero; billing control false.
- Accounting/payroll source files untouched; index change only updates subscription-customer script cache version. Main asset deployment changed only index.html and subscription-customer.js.

## Deployments
| Worker | Verified deployment version |
|---|---|
| dalasipay-admin-auth-private | d87a5f81-a1aa-4387-904b-7cb1b94167f0 |
| dalasipay-admin-staging | 31e6fecf-d607-4fcd-844b-e239038e2f1b |
| dalasipay-licensing-staging | 7c8e8ce6-09a5-4bc7-819e-a8d05056cb16 |
| dalasipay | 0041f285-4232-4bf3-9332-82a26e8bf803 |

Private Worker public and preview URLs remain disabled; staging ADMIN_MEMBERSHIP_SERVICE binding remains connected. Anonymous dashboard access redirects to Cloudflare Access. Signed JWT subject and server-side administrator mapping remain required.

## Remaining commercial decisions / limitations
Payment provider, tax treatment, refunds/credits, proration, document delivery and reminder delivery need owner decisions and a separately verified activation release. PDF support here is print-ready HTML / browser Save as PDF, not an automated PDF service. Billing tables and guarded database workflows are prepared; issuance/payment controls and document routes are deliberately not enabled in the live UI. No existing customer was migrated or billed. Preview allowances remain unlimited even when draft limits are shown.

Supabase security advisor: ledger RLS/no-policy notices are intentional deny-all raw-table access; access goes through checked functions only. Authenticated SECURITY DEFINER customer RPC warning is expected and covered by ownership/live-session tests. Existing leaked-password-protection warning remains; enabling it is a separate account security decision: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection . No new high-severity finding.
