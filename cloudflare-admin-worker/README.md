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

## Controlled first administrator

No administrator was appointed in this rollout. Do not derive the Access subject
from Cloudflare account ID, Supabase UUID, or matching email.

1. Independently verify the candidate and active Supabase Auth UUID. Obtain a
   separate approver, operator, reason, and approval reference. Choose an existing
   organization UUID solely as the required audit-event anchor; event metadata
   explicitly records platform scope.
2. Obtain a fresh Access assertion through the trusted operator's authenticated
   session into a protected local file. Do not paste it into chat, shell history,
   a URL, or the repository. Set nonsecret `ACCESS_ISSUER` and `ACCESS_AUDIENCE` in
   the local environment and run:

   ```sh
   node cloudflare-admin-worker/verify-bootstrap-subject.mjs PROTECTED_TOKEN_FILE NEW_PRIVATE_EVIDENCE_FILE
   ```

   The tool verifies the actual signature against the trusted issuer's current
   keys before writing subject evidence. It does not appoint anyone. Review that
   evidence independently and set `EXPECTED_ADMIN_ACCESS_SUBJECT` to that exact
   verified subject. Dispose of the token file through the operator's secure
   local handling process; preserve only the reviewed identity evidence.
3. The authorized database operator runs `bootstrap-first-admin.sql` using psql
   against project `zdpmlzmljozcmqndyfog`, in a protected postgres session. Supply
   its required psql variables using a protected local input file. The script
   rejects nonempty bootstrap state, inactive/unknown UUIDs, invalid subjects,
   missing organizations, and missing or same-person approval. It locks both
   identity tables, inserts membership and the approved mapping, and appends the
   appointment audit event in one transaction. Any error rolls everything back.
   No bootstrap endpoint or permanent database function is created.
4. Independently review exactly one expected membership, mapping, and audit event.
   Run deployment verification step 7. Retain the approval and outcome in the
   controlled security record. Subject changes require a new reviewed mapping.

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
