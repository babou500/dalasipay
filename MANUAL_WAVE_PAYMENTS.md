# Manual Wave subscription payments — requirements and verified disabled-mode release

Wave is the ONLY subscription payment method. No Wave API, automatic collection/verification, cash, bank transfer or card subscription payments are implemented or permitted. Annual GMD prices remain Free D0, Standard D12,500 and Professional D25,000.

## Receiving account
Administrator Settings allows only the platform owner identified by the immutable, verified single-owner bootstrap audit to save an international Wave phone number and account name. Active server-side administrator membership and a verified Cloudflare Access JWT subject are still required. Edits require explicit confirmation, reason, version matching, row locking and immutable before/after audit; failures roll back together. No email-based appointment or owner inference is used. No actual receiving account has been supplied or configured during development.

## Customer submission and evidence
The main application's existing Supabase session/RPC supports the prepared reference submission and optional screenshot workflow for an owned, real annual invoice. The exact amount comes from the invoice snapshot, never customer input. A failed optional upload preserves the submitted reference and provides an owner-scoped retry reservation. Repeated submissions do not create multiple active payments for one invoice.

In development, the customer page withholds the receiving phone/account name, publishes no invitation to transfer, and disables submission controls. Server-side mutations and Storage uploads independently require the commercial gate; the enforced database CHECK(enabled=false) remains intact. Publishing settings alone cannot enable transfers or submission.

Screenshots use a private Supabase Storage bucket, PNG/JPEG only, maximum 5 MiB. Upload paths are allocated server-side for a specific owned payment/invoice and checked against a confirmed, live owner session. Customers cannot read, list, replace or delete evidence; restrictive policies protect against broader permissive Storage policies. No public or signed download URL is issued. Administrators download through the Access-protected Dashboard and private Worker after signed-subject authorization, path/byte/size validation, with attachment, no-store, nosniff and sandbox headers. Other payroll/document buckets and their existing policies are unchanged.

## Independent review
Customer-facing statuses are Pending Verification, Verified and Rejected (existing ledger status paid maps to Verified). The administrator must independently inspect the actual incoming Wave transaction history, explicitly attest to that check, re-enter its reference and exact amount, and record a reason. A reference or screenshot alone never verifies payment. Self-review remains prohibited, including for the owner acting as a customer. Human attestation is recorded; the system does not claim to verify Wave's external history automatically.

Normalized references and idempotency keys are unique; invoice/payment locks, optimistic versions, one active payment per invoice and a unique receipt per payment prevent duplicate confirmation and receipts. Rejected records and evidence remain in history. References stay reserved after rejection; disputed/mistyped-reference remediation requires a separately designed audited workflow before commercial launch.

Verified/rejected decisions, customer submissions and evidence attachments append immutable billing audit events. Receipt creation, payment decision and audit commit atomically. Verification NEVER changes subscription entitlements or activation dates. The previous generic record/confirm payment actions and direct legacy RPC execution are revoked; the subscription workflow accepts Wave only.

## Interfaces and documents
- Main Settings → Subscription & Plans: approved annual catalogue, unlimited Preview status, disabled Wave submission, and owner-scoped payment/review/receipt history. Future-enabled submission/upload path is prepared and tested.
- Administrator Settings: owner-only recipient configuration.
- Administrator Billing: read-only development overview, payment statuses, independent review controls (gated), protected evidence/receipt routes and payment audit history.
- Wave receipts: authenticated administrator print-ready HTML / browser Save as PDF, with invoice, business, annual service dates, amount, method, Wave reference and unique receipt number. No actual receipt was issued.
- Standalone customer portal: shared payment history and disabled-mode notice. Commercial submission/receipt download integration there remains a future activation task; its separate signed-in page was not re-tested live.

## Verification and deployment
Applied only new migration `20261009165155_manual_wave_payments.sql`. Existing pricing/billing migrations were not re-applied.

177 Node tests and 27 PostgreSQL integration tests passed, zero failures/skips. Coverage includes JWT/service binding, active owner configuration, versions/audit rollback, hidden receiving details, exact invoice amounts, manual attestation, self-review denial, normalized duplicate rejection, immutable/unique receipts, customer isolation, private insert-only Storage policies even under a simulated broad policy, evidence byte/path checks, revoked legacy RPC access and unchanged entitlement snapshots. Commercial paths run only in disposable PostgreSQL fixtures with the gate explicitly removed there. No production test invoices, transfers, payment submissions, evidence or receipts were created.

All four Cloudflare dry runs passed. Manual deployment versions:
| Worker | Version |
|---|---|
| dalasipay-admin-auth-private | 0ab99cd8-09df-4b1e-aa40-285109f42952 |
| dalasipay-admin-staging | 8e4637a8-a811-4bbb-bc0d-c1d8dfc48f1b |
| dalasipay-licensing-staging | e8fb00c2-2d34-42ea-9e9f-5f00e3a41699 |
| dalasipay | f710e513-ea6f-438d-b2d5-691668304ff2 |
GitHub-connected main builds may subsequently redeploy identical merged assets; verify deployed customer-script bytes against the merged source.

Live authenticated administrator Wave settings and empty Billing/audit overview verified. Live customer disabled Wave panel, correct prices, BE Business Solutions unlimited Preview and preserved cancelled request verified. Private Worker public/preview URLs remain disabled; anonymous administrator access redirects to Cloudflare Access. Real screenshot upload and actual Wave-history review were intentionally not performed live while commercial mode is disabled.

Before/after production verification: 13 subscriptions, all unlimited Professional Preview, full-row checksum `16d01b4bd7d59de8ae4df5dcec963e60`. Prices and draft versions unchanged. Billing false; receiving details unconfigured; zero invoices, payments, receipts and evidence objects. Accounting/payroll source untouched; main index change only updates the subscription script cache version.

Supabase advisors retain intentional deny-all raw-table RLS notices and checked SECURITY DEFINER RPC notices (customer RPC and the boolean Storage ownership helper). Existing leaked-password-protection warning remains: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection . No new high-severity finding.

## Outstanding owner decisions before any commercial launch
Supply and verify the genuine receiving Wave number/name through Administrator Settings. Approve commercial launch separately; saving configuration does not constitute launch approval. Define receipt/tax wording, evidence retention and dispute/refund/reference-correction procedures. Authorize a genuine separate customer test account for a live independently reviewed workflow; the sole administrator cannot review their own BE Business payment. Complete commercial UI/Storage end-to-end verification and a reviewed gate/activation release before inviting transfers. Entitlement-changing approval, billing enforcement and all licensing restrictions remain separately disabled.
