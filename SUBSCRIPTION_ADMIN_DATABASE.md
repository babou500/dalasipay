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
