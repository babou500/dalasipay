# Administrator authentication rollout

## Verified cause of the 503

The deployed private Worker used `fetch(..., {redirect:'error'})` for Access
signing keys. Cloudflare `workerd` rejects that option with `Invalid redirect
value, must be one of "follow" or "manual"`. This happened before the network
request; the private catch returned 503, and staging replaced its diagnostic
with `identityMatched:false`. Node's fetch supports this option, so the existing
Node tests did not expose the runtime mismatch.

The deployed fix uses `manual` for signing keys and database requests and rejects
all non-2xx responses, including redirects. Credentials cannot follow redirects.
Staging forwards only allowlisted diagnostic codes. It never returns JWTs,
credentials, actual subjects, upstream bodies, or exception messages.

`worker-paste-private.js` is the deployed private entry point. `staging-entry.mjs`
is the deployed dashboard entry point. Older modules are isolated prototypes;
do not deploy `index.mjs` as the Administrator Dashboard. The existing
`/internal/admin/check` URL is retained as an alias for authorization.

## Authentication and read-only data

Staging forwards the incoming Access assertion through `ADMIN_MEMBERSHIP_SERVICE`.
The private Worker validates RS256, trusted issuer, application audience, expiry,
issued-at, optional not-before, signing-key ID, and cryptographic signature. It
uses only the verified JWT `sub` for the restricted boolean membership RPC.
Emails, request bodies, and identity headers cannot select an administrator.

Identity matching is an optional comparison with `EXPECTED_ADMIN_ACCESS_SUBJECT`;
it needs no database key and grants no permission. Administrator authorization
requires an approved exact-subject mapping joined to the platform allowlist.
The real operator's subject still needs independent verification before bootstrap.

After authorization, `/` renders real subscription rows. The private service
issues only a GET selecting workspace ID, plan, status, Professional Preview,
and last-update time; pages are bounded to 100 rows. HTML is escaped and served
with no-store and a restrictive CSP. There are no appointment, billing, plan-change,
accounting, or payroll mutation endpoints. Preview remains unlimited.

## One deployment procedure

Use Node 22 or newer and Wrangler **4.149.0**. This computer also has bundled Node
24 at `C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`.
Run these commands from the repository root with the chosen Node on PATH:

1. Run `npx wrangler@4.149.0 whoami`. Confirm the existing Cloudflare account ID
   `40e35bbd6d3097406a7c8f6e5e9bd4c8`. If necessary, use Wrangler login; do not send
   credentials through chat.
2. Confirm the existing Access application covers the entire staging hostname
   `dalasipay-admin-staging.baboucarrnjie212.workers.dev`, with no bypass policy.
   Its configured issuer is `https://throbbing-salad-ace9.cloudflareaccess.com`
   and audience is `2d449e11a99981d10cac40746e34cfb3208ec2161a769855db0c402875ea5602`.
   These are application identifiers, not credentials.
3. In the private Worker's settings, retain the issuer, audience, verified expected
   subject, project URL, and encrypted `DALASIPAY_SUPABASE_SERVICE_ROLE_KEY`.
   The key must exist only on the private Worker. Retain staging's service binding
   to `dalasipay-admin-auth-private` production. Never enable private workers.dev,
   preview URLs, routes, or custom domains.
4. Run the tests below. Build both Workers with `deploy --dry-run` before upload.
5. Deploy private first, then staging, preserving existing variables:

   ```sh
   npx wrangler@4.149.0 deploy --config cloudflare-admin-worker/wrangler.private.toml --keep-vars
   npx wrangler@4.149.0 deploy --config cloudflare-admin-worker/wrangler.staging.toml --keep-vars
   ```

6. Recheck the settings and binding. A fresh unauthenticated request must redirect
   to Access. Private workers.dev and preview URLs must remain disabled. Test a
   real Access session at `/internal/admin/identity-match`: a verified comparison
   returns HTTP 200 with a boolean; a backend failure remains 503 with a safe
   `check` code. A match is not an appointment.
7. Perform the separately approved bootstrap below, then test real operator
   `/internal/admin/check` (200, authorized true), `/internal/admin/subscriptions`
   (real rows), and `/` (read-only table). Also verify a nonadministrator gets 403.
   Record status codes, Worker version IDs, approval reference, and results;
   never retain tokens in public logs. Do not declare a positive live end-to-end
   result until this step succeeds.

Use `npx wrangler@4.149.0 rollback --help` for a rollback and select the recorded
prior version of each Worker. Roll back staging before private, retain Access
protection, and recheck private URL disablement. A code rollback does not revoke
an appointed administrator; revocation must be a separately audited database
transaction that disables the exact mapping, removes membership, and appends a
`platform_admin_revoked` event. Do not restore any subscription rows for rollback.

## Controlled single-owner first administrator

The sole owner explicitly authorized this initial appointment on 2026-10-09.
A second approver is not required for the documented single-owner exception.
No administrator may be appointed until all checks below succeed.

1. Through authenticated infrastructure APIs, verify GitHub repository administrator
   access, the Cloudflare account and email, and the connected Supabase project.
   Query Supabase to establish the confirmed, active Auth UUID, organization creator,
   and exactly one organization member with role `owner`. Matching email alone is
   insufficient. Record the checked facts and authorization reference privately.
2. Obtain a fresh Access JWT using the owner's interactive Access sign-in and the
   supported Cloudflare client. Keep it in protected temporary storage; never put
   it in chat, logs, shell history, URLs, or Git. Set `ACCESS_ISSUER`,
   `ACCESS_AUDIENCE`, and `OWNER_EMAIL`, then run:

   ```sh
   node cloudflare-admin-worker/verify-bootstrap-subject.mjs PROTECTED_TOKEN_FILE NEW_PRIVATE_EVIDENCE_FILE
   ```

   This uses the same signature verifier as the private Worker, checks the pinned
   issuer/audience and current signing keys, and obtains the actual signed `sub`.
   It does not infer `sub` from login logs, account IDs, or email. Set the private
   Worker's `EXPECTED_ADMIN_ACCESS_SUBJECT` to this verified subject.
3. The trusted infrastructure operator executes `bootstrap-owner.sql` in a
   protected `postgres` session on the connected project. Supply the required
   psql variables listed in that file using protected local input. Identity evidence
   must come from the verifier, not user-submitted JSON. Ownership evidence uses
   `source=authenticated_infrastructure_and_database_checks`, `githubRepository`,
   `githubAdmin`, `cloudflareAccountId`, `cloudflareAccountEmail`, and
   `supabaseProject`. Retain the owner's exact authorization and reference.

   The SQL rechecks active confirmed ownership and sole membership, locks the
   relevant rows/tables, and inserts membership, exact-subject mapping, and an
   honest `single_owner_initial_bootstrap` audit event atomically. It requires fresh
   verified identity evidence and empty administrator state. Any error rolls back.
   An existing appointment audit event permanently consumes bootstrap eligibility,
   including after revocation. The legacy two-person script checks the same marker.
   No reusable bootstrap endpoint or permanent privileged function is created.

   The database cannot itself authenticate a JSON signature-verification flag:
   the trusted offline operator must run and review the verifier first. Browser and
   service roles cannot execute this privileged procedure.
4. Review the single expected membership, mapping, and append-only audit event.
   Compare the full ordered subscription snapshot checksum before/after. Test a
   real signed session at identity-match, authorization, subscriptions, and the
   dashboard; verify unauthorized subjects remain denied. Retain only safe evidence
   and results, then remove the temporary token. Do not claim completion before
   the live authorized flow succeeds.

## Tests

PowerShell, repository root:

```powershell
$adminTests = (Get-ChildItem cloudflare-admin-worker -Filter '*.test.mjs').FullName
node --test @adminTests
npm ci --prefix tests/admin-auth-runtime --ignore-scripts --no-audit --no-fund
$env:PGLITE_MODULE = (Resolve-Path tests/admin-auth-runtime/node_modules/@electric-sql/pglite/dist/index.js).Path
node --test tests/admin-bootstrap.postgres.test.mjs
```

The second suite executes PostgreSQL in a disposable PGlite engine, including the
actual bootstrap script and both Worker entry points. Its HTTP transport is an
in-process adapter; it does not prove Cloudflare Access browser sign-in or live
Supabase PostgREST. The GitHub workflow runs both suites. See
`VERIFICATION.md` for the actual run results and remaining live test.
