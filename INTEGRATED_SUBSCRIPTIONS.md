# Connected DalasiPay subscription management

The main application's Settings → Subscription & Plans section uses its existing Supabase client and session to call `customer_subscription_portal`. No second login, customer copy, local plan record, service-role key or cross-origin credential transfer is introduced.

Both interfaces read the same `organizations`, `workspace_subscriptions`, `licensing_plan_drafts` and `subscription_change_requests` records. Administrators enter through Cloudflare Access; the private service verifies the signed JWT and approved subject mapping, then invokes the restricted administrator RPC. The customer RPC validates a confirmed active Auth user, a current server-side session and owner membership. Other workspaces and privileged administrator actions remain inaccessible to customers.

Customers can inspect the real current plan/status, configured draft limits/features, submit upgrades, downgrades/plan changes or renewals, cancel pending requests and read recorded review reasons. Refresh reloads authoritative information. Requests and reviews append audit records atomically; review approval never changes entitlements. Administrator self-review remains blocked.

The administrator directory queries organizations directly, including their actual names, IDs and registration dates. No synchronization copies or duplicate records are required. Future organization inserts initialize exactly one informational Free subscription using the existing client model's new-workspace default. A failed subscription/audit insert rolls back creation. Existing organizations are not backfilled, migrated or updated. Billing, expiry enforcement and feature/usage restrictions remain off.

## Deployment and rollback

The main Worker was verified as static-only, with no bindings. Existing script/style content matched the repository after normalizing line endings. Run `node cloudflare-main/prepare-assets.mjs`, then `wrangler deploy -c cloudflare-main/wrangler.toml --dry-run` and `wrangler deploy -c cloudflare-main/wrangler.toml --keep-vars`. The configuration preserves the existing main domain, compatibility date and public/preview URL settings. Deploy the administrator staging Worker with its existing configuration. The private Worker needs no code change for this integration.

Apply `supabase/migrations/20261009025345_integrated_customer_subscriptions.sql` once. It replaces only the customer RPC's read response and adds a future-insert trigger, without updating existing subscription rows. Database rollback must preserve audit history and any genuine subscriptions created after rollout; never delete customer rows to undo a deployment.

Verified versions: main `de94a8db-50fe-483e-8145-8210b5a86ca0`; administrator staging `9a7216dd-f644-4bcd-aee3-51f66c70b857`. Main pre-release rollback version: `5fd3aec2-f3a0-4c74-85eb-9f3cf0deee0b`; administrator pre-release version: `15d5278d-fb1c-4b4d-a525-67ef254c1d9b`. Roll back Worker code using the supported Cloudflare version rollback procedure after reviewing database compatibility.

## Verification and outstanding authorization

Regression tests cover RPC action isolation, safe DOM rendering, server-derived plans/history, stale workspace responses, startup independence, owner/session isolation, administrator authorization, request/review transaction rollback, immutable auditing and preservation of Preview rows. Future workspace creation and shared catalogue visibility are exercised only in disposable PostgreSQL fixtures; no fictitious production customers or requests are created.

All 13 production subscriptions remain Professional Preview. Before/after full-row checksum using `md5(string_agg(to_jsonb(s)::text,'' order by organization_id))`: `16d01b4bd7d59de8ae4df5dcec963e60`. Accounting/payroll modules are unchanged.

The owner deferred customer sign-in. Live authenticated main-app request submission and a genuine request-to-administrator review journey remain pending; do not describe them as fully verified. No customer password or token is needed in chat.

Ready: shared read views, configurable informational plan drafts, audited customer requests and review decisions. Explicit authorization required: entitlement-changing approvals, pricing/billing, expiry enforcement, plan restrictions and migration of existing customers.

Database advisors retain intentional RPC-only RLS tables and the deliberately authenticated security-definer customer RPC, whose session and owner checks are tested. Existing [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) is still disabled; no Auth policy was changed.
