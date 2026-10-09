# Subscription and Licensing Management

This management layer uses the existing Supabase project and three existing Workers.
It does not modify accounting/payroll source or activate billing, limits, or plan changes.
The 13 existing Professional Preview subscriptions retain their complete original rows.

## Administrator interface

Cloudflare Access sign-in and exact signed-subject administrator mapping are required.
Subscriptions retain the original search/filter overview. Navigation now includes:

- Businesses: real workspace names, current subscription, members, planning renewal date.
- Business profile: real saved industry, size, currency, creator account email and confirmation,
  dates, subscription details, requests, and history. Missing facts are shown as not recorded.
  Administrative notes and renewal planning dates are separate from subscription rows.
- Plan drafts: Free, Standard, Professional with configurable labels, approved feature keys,
  and limits (blank means unlimited). Defaults come from the existing observational catalogue.
  Saving a draft cannot apply it to customers or activate restrictions.
- Requests: customer upgrades, renewals and plan-change requests, with reasoned approval/rejection.
  Reviews change request state only. Existing anti-self-review rules remain.
- Audit: immutable subscription events and new management events; no authentication tokens.

Mutations use POST, exact Origin/same-origin checks, bounded input, private service binding,
verified Access subject, and database authorization. Draft/profile edits use optimistic versions;
request review locks/rechecks pending state. Audit failure rolls back the administrative write.
The new management RPC is service-role-only and independently checks administrator membership.

## Customer interface

https://dalasipay-licensing-staging.baboucarrnjie212.workers.dev/subscriptions

The standalone portal uses existing Supabase email/password accounts, not a new customer roster.
It creates no accounts, charges, or subscriptions. Customers with workspace owner membership
can view their own records, submit one pending request per workspace, and cancel their own
pending requests. Requests and review notes remain visible in the portal history.

Tokens are held in browser memory, sent only in authorization headers to the trusted Auth/Worker
endpoints, and never stored in URLs, cookies, localStorage or sessionStorage by this portal.
The publishable client key is public configuration; service credentials remain private.
Auth is verified remotely before the RPC, which rechecks confirmed active identity, active
Supabase session, and workspace ownership. No anonymous request or administrator operation
is permitted. Customer endpoints never use the service-role credential.

## Migration and rollout

The migration was created with the Supabase CLI, tested in isolated PostgreSQL, then applied
through the Supabase connector. Its filename matches the applied migration history version:
20261009022714_licensing_management.sql. It depends on the existing licensing schema.
The new tables have RLS and no direct browser/service table grants. Customer RPC access is
restricted to authenticated; management RPC access is restricted to service_role.
Existing append-only audit constraints and the dormant plan-change gate remain unchanged.

Deploy private authentication, administrator staging, then existing licensing staging with
--keep-vars. Keep private workers.dev/preview URLs disabled and retain the existing Access app.
Rollback code in reverse order using recorded previous versions. Retain the additive schema
and audit evidence; do not delete audit records or restore customer subscription rows.
For an emergency shutdown, revoke EXECUTE on the two new RPCs in a privileged audited session.

## Decisions still requiring explicit authorization

Paid prices/currencies, billing cycles/providers, effective dates, enforcement, automatic
renewals, applying approved requests, and any Professional Preview transition are inactive.
No activation endpoint is implemented. Existing default limits are drafts for review.
Account profile edits do not change core organization or subscription records.
Self-review remains forbidden: the sole administrator cannot approve a request they submitted.
A future exception would require a separately authorized and audited policy decision.

Do not create fictional customer requests to test production. Write workflows are tested
in isolated PostgreSQL; live verification uses real read-only records and legitimate draft
saves. A customer's real submission is verified only when that customer chooses to request it.
