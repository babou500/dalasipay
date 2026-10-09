# Licensing management verification — 9 October 2026

Implemented customer workspace profiles, real subscription/history views, separate renewal planning, configurable Free/Standard/Professional drafts, customer upgrade/renewal/change requests, administrator review, immutable audit history and responsive navigation.

## Actual results

- Complete relevant local suite: 164 Node tests and 15 PostgreSQL integration tests passed; zero failures or skips.
- GitHub licensing/security CI passed: https://github.com/babou500/dalasipay/actions/runs/37875363921
- All three existing Worker dry runs passed.
- Migration `20261009022714_licensing_management.sql` applied to the existing Supabase project.
- Fresh signed Cloudflare Access identity verified for signature, issuer, audience and expiration. Live administrator requests traversed the staging Worker, private service binding and Supabase successfully.
- Live businesses, owned business profile, plans, requests, audit and overview pages returned HTTP 200 with real database information.
- Business search and entitlement filtering returned the expected 13 overview rows, one matching plural business name and zero nonexistent matches.
- A same-value Free draft save returned 303 and appeared in audit history. Stale replay returned 409; cross-origin submission returned 403. No customer entitlement changed.
- Anonymous administrator access redirected to Cloudflare Access. Anonymous and invalid-identity customer API requests returned 401.
- Public customer portal, stylesheet and script returned 200 and the sign-in interface rendered in the browser.

## Deployed versions

| Existing Worker | Verified deployed version |
| --- | --- |
| dalasipay-admin-auth-private | 1cbf550d-4827-4114-82f2-6469b4a90d7f |
| dalasipay-admin-staging | 15d5278d-fb1c-4b4d-a525-67ef254c1d9b |
| dalasipay-licensing-staging | e92fb10b-4bc0-47bf-a847-4985751d3782 |

Private public and preview URLs remain disabled. The staging administrator binding still points to the existing private Worker. Public staging preview URLs are disabled.

Administrator: https://dalasipay-admin-staging.baboucarrnjie212.workers.dev/
Customer portal: https://dalasipay-licensing-staging.baboucarrnjie212.workers.dev/subscriptions

## Preservation and security

All 13 existing Professional Preview subscriptions remain unlimited. Full customer subscription checksum before and after: `8c713fa30d53aaec16e3a4056ae52cd4`. No customer requests or renewal-planning records were fabricated. Billing enforcement and subscription restrictions remain disabled. Approval records a decision only; it cannot apply an entitlement change.

Accounting/payroll source was not changed. Only the three named Workers were deployed by this task.

Database tests cover tenant isolation, confirmed active identity and session, administrator subject mapping, self-review rejection, atomic audit rollback, stale versions and immutable audit records. New tables have RLS and revoked direct grants; only restricted RPCs expose permitted operations. Authentication tokens are not persisted by the customer portal.

## Remaining verification and decisions

The owner elected to sign in to the customer portal later. Live authenticated customer workspace loading and a real request-to-review journey therefore remain unverified. Those workflows passed isolated PostgreSQL integration tests; this report does not claim their live completion.

Prices, renewal rules and activation of approved entitlement changes require business decisions and explicit authorization. Current plan configurations are drafts only.

Supabase reports existing leaked-password protection is disabled; no Auth setting was changed. See [Supabase password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Intentional RPC-only tables and the guarded authenticated customer RPC were reviewed against the database advisories.
