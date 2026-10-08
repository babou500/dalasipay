# Subscription administration database

Migration applied to DalasiPay Supabase project on 2026-10-08.

Tables:
- public.subscription_change_requests: future plan change requests with organization scope, requester, target plan, reason, status, optional reviewer and timestamps.
- public.subscription_admin_events: future subscription administration event log with organization, actor, request, event type, plan identifiers and timestamps.

Security:
- Row Level Security enabled on both tables.
- anon and authenticated privileges revoked.
- service_role receives direct table privileges; only a separately designed authenticated server API should use these.
- No browser-facing plan mutation endpoints exist.
- No enforcement, payments or upgrade requests have been activated.

Verification: both new tables had zero rows immediately after migration; 13 Professional Preview workspace subscriptions remained.

Future work:
- Design role and cross-tenant authorization checks on a separate server endpoint.
- Define append-only audit protections and atomic request/review transactions.
- Build tests before granting plan-changing permissions.
