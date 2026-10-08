# Isolated Cloudflare licensing observer (NOT deployed)

Entry point: `cloudflare-licensing-worker/index.mjs`.

This is a **separate, opt-in Worker**. Do not attach it to the existing DalasiPay Pages project or route its traffic through the main application until the production Cloudflare account and routing have been verified.

## Required secret bindings
- `DALASIPAY_SUPABASE_URL`: the active DalasiPay Supabase project URL
- `DALASIPAY_SUPABASE_PUBLISHABLE_KEY`: public publishable key (still configure as environment binding)
- `DALASIPAY_SUPABASE_SERVICE_ROLE_KEY`: **secret** service-role key; configure only in Cloudflare Worker secret storage. Never commit, print, bundle or expose it to client JavaScript.

## Intended behavior
- Only `GET /internal/licensing/observe?workspaceId=<uuid>` is handled.
- Caller must supply a valid Supabase bearer access token.
- Token is verified by Supabase Auth, and membership is checked in `organization_members` before reading `workspace_subscriptions`.
- The response is observation-only and always reports `enforcementActive: false`.
- Current monthly invoice and bill usage is **unknown**, not zero. Do not enforce caps from client state.
- No CORS headers are configured. Do not enable arbitrary cross-origin access.
- No billing, plan mutation or startup dependencies.

## Required before deploying
1. Identify and confirm the actual Cloudflare account, project, routes and rollback process.
2. Run GitHub licensing tests and Worker integration tests in a staging environment.
3. Deploy as a separate Worker, not a catch-all replacement for the application.
4. Keep the service-role credential secret; configure least-privilege access if a dedicated role is available.
5. Verify anonymous requests return 401, unauthorized workspace membership returns 403, and authorized Professional Preview requests return read-only data.
6. Validate that the normal DalasiPay login, dashboard, invoices, supplier payments and payroll remain unaffected.

No deployment has been performed by adding these files to GitHub.
