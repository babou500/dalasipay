# Live subscription integration verification — 9 October 2026

## Scope and authorization

The owner explicitly limited the test to BE Business Solutions as a customer and then approved one Professional renewal verification request with no entitlement changes. The request was submitted once through the authenticated main application. No database impersonation, fabricated customer, authentication bypass, review decision, cancellation or audit deletion was performed.

## Passed live checks

- An existing signed-in customer session opened the main application's Settings → Subscription & Plans section. This verifies session restoration and authenticated access; a fresh password sign-in was not performed.
- The section displayed BE Business Solutions, its real workspace ID and registration timestamp, Unlimited Professional Preview and `professional_preview` status.
- Free, Standard and Professional draft features/limits loaded from Supabase; request history initially showed no requests.
- The approved renewal request saved successfully, appeared as pending in customer history and disabled duplicate submission.
- The same request appeared in the authenticated Administrator Dashboard with the same business, request type, reason and timestamp.
- The dashboard showed “Self-review is unavailable.” No review form was offered for the requester's own administrator identity.
- Audit event **subscription:2**, type `request_submitted`, was visible in the Administrator audit history. Database evidence records `kind: renewal`, previous/proposed plan `professional`, and `subscription_changed: false`.
- Request and audit timestamp: **2026-10-09T15:00:44.685753+00:00**. Full request/actor identifiers are retained in the immutable database audit and local verification evidence, not copied into this public report.
- Anonymous customer RPC returned **401**. Anonymous Administrator requests returned **302** to the trusted Cloudflare Access issuer.
- Database permissions deny anonymous customer RPC execution, authenticated customer execution of the administrator RPC and direct customer subscription-table reads.
- All **13** existing subscriptions remain unlimited Professional Preview. The full-row checksum before and after submission is **16d01b4bd7d59de8ae4df5dcec963e60**.

## Regression results

**169 Node tests and 18 PostgreSQL integration tests passed**, with zero failures or skips. Tests include owner/session isolation, forged identity denial, approved Access subject mapping, server-side administrator authorization, self-review rejection, atomic request/review auditing, audit rollback and unchanged Preview entitlements.

No functional defect was found during this run. No application code, schema, Worker deployment, accounting/payroll logic, billing, expiry enforcement or feature restrictions were changed.

## Checks still unverified

- A fresh customer credential sign-in: the existing restored production session was used.
- Successful live administrator approval/rejection and customer display of its decision: the authorized customer is also the sole platform administrator, and the existing server-side self-review guard forbids this operation. That guard remains intact. The workflow passed isolated database tests, but that is not a successful live review.
- A second customer's live cross-workspace denial: only BE Business Solutions was authorized for this test. Isolation passed isolated database regression tests; no other real customer's identity was used.
- A live review audit event: none should exist because no review decision was authorized or recorded.

The genuine request remains **pending**, with its audit history preserved. Completing the live review journey requires explicit authorization to use a genuine existing customer account different from the reviewer. No additional administrator or fictitious approver is needed; no account or policy change is proposed by this report.
