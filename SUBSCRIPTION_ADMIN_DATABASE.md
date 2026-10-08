# Subscription administration database

Migration applied to DalasiPay Supabase project on 2026-10-08.

Tables:
- public.subscription_change_requests: future plan change requests with organization scope, requester, target plan, reason, status, optional reviewer and timestamps.
- public.subscription_admin_events: future subscription administration event log with organization, actor, request, event type, plan identifiers and timestamps.

Security:
- Row Level Security enabled on both tables.
- anon and authenticated privileges revoked.
- service_role has access for controlled server operations. On the audit-event table, UPDATE and DELETE have been revoked.
- A database trigger rejects UPDATE or DELETE to existing audit-event rows; only new events may be appended.
- Only a separately designed authenticated server API should access these tables.
- No browser-facing plan mutation endpoints exist.
- No enforcement, payments or upgrade requests have been activated.

Verification: both new tables had zero rows immediately after migration; 13 Professional Preview workspace subscriptions remained.

Future work:
- Design role and cross-tenant authorization checks on a separate server endpoint.
- Design atomic request/review transactions with enforced actor permissions. Append-only audit trigger is installed; full privilege and mutation testing is still pending.
- Build tests before granting plan-changing permissions.

## Inactive atomic review foundation (2026-10-08)

Migration `inactive_atomic_subscription_review` created an empty `subscription_platform_admins` allowlist and the `review_subscription_request_internal` SQL function. The function uses a single database transaction for updating a pending request and appending an audit event, checks platform membership, excludes self-review, and never changes `workspace_subscriptions`. Function EXECUTE is revoked from PUBLIC, anon, authenticated and service_role. The platform allowlist has RLS enabled and the same role grants revoked. No public endpoint is mounted. The function is SECURITY INVOKER, so it must not be exposed as an RPC before a separately designed secure deployment.

Before activation: independently test rollback and concurrency; decide who can appoint platform administrators; implement server authentication, real actor identity verification and server-side membership authorization; grant minimal scoped rights to a dedicated role after a security review. Do not grant service_role EXECUTE merely to make an endpoint work.

## Independent database verification (2026-10-08)

Read-only catalog checks confirmed the review function is SECURITY INVOKER and EXECUTE is denied to anon, authenticated and service_role. The platform-admin list contains zero entries. Request and audit tables are empty. All 13 Professional Preview records remain. The service role lacks audit-event UPDATE privilege; authenticated cannot SELECT the admin allowlist. A non-destructive test call using an unregistered reviewer raised the expected insufficient-privilege exception and was handled in the test block. Positive-path atomic rollback and concurrent-review behavior remain unverified because no platform reviewer or test requests have been created. No permission was granted and no plan changed.

## Transaction simulation (2026-10-08)

Added isolated JavaScript tests for failed-audit rollback, staged review events, and unauthorized reviewer denial. These are logic simulations only, not evidence of PostgreSQL transactional rollback or concurrent database access. Live SQL function still uses SELECT FOR UPDATE and same-transaction request UPDATE/audit INSERT; independently validate those semantics against disposable test fixtures in a nonproduction Supabase environment before enabling the function. No platform administrators, requests, events or plan changes were created by these GitHub tests.

## Platform administrator appointment policy (inert)

Added `licensing-platform-admin-policy.mjs` and tests. Proposed appointments or revocations require existing platform authorization, a different target user, explicit confirmation, reason, independent approval, atomic persistence and an audit entry. The policy always returns `canExecute:false`; it does not insert or revoke administrators, expose a server endpoint, or bootstrap the first administrator. A separately approved offline bootstrap procedure will be needed. Company owner membership alone does not authorize platform billing plan grants. No production plan or permission changes were made in this step.
