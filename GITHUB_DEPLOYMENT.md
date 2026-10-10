# DalasiPay deployment without Codex

Use GitHub pull requests for development and GitHub Actions for tests and explicitly approved Cloudflare releases. No Codex session is required. The existing four Workers and Supabase database remain authoritative. This workflow never runs database migrations, enables billing, changes entitlements or installs a second subscription system.

## One-time owner setup — required before any deployment

1. In Cloudflare, open **Workers & Pages → each DalasiPay Worker → Settings → Builds**. Disable/disconnect automatic Git deployments for all connected production Workers (including `dalasipay` and `dalasipay-licensing-staging`), without deleting Workers, domains or secrets. Alternatively change each production deploy command to `npx wrangler versions upload` with its existing config so builds upload inactive versions only. Disable automatic preview deployments too if present. Inspect pending builds and cancel any that could deploy. Existing traffic must remain on its current version. The saved CLI login currently receives HTTP 403 for the Workers Builds API, so this step has NOT been completed by this release.
2. GitHub repository **Settings → Environments → New environment → `cloudflare-production`**. Set required reviewer to owner `babou500`, disallow administrator bypass, and restrict deployments to selected branch `main`. As sole owner, leave **Prevent self-review** off so you can approve your own manually dispatched release. Do not invent another approver. GitHub plan/repository visibility must support required reviewers; if unavailable, do NOT add credentials or enable this workflow's deployment path. Obtain a supported plan or keep manually approving releases in Cloudflare until it is available.
3. Create a scoped Cloudflare API token in Cloudflare's secure UI: target only the existing account, Workers Scripts Edit and Account Settings Read; add Zone Read / Workers Routes Edit only for the existing main application's zone if needed by its custom-domain configuration. No Access-policy editing, Supabase credentials, account-wide global API key or billing access. Set expiry and rotate routinely. Review the actual Cloudflare permission requirements for your account before saving.
4. **Only after reviewer protection is saved**, add environment secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` under `cloudflare-production`. Account ID: `40e35bbd6d3097406a7c8f6e5e9bd4c8`. Never add this deploy token at repository or organization scope, paste it into chat, or commit it. Supabase service-role credentials remain in the existing private/portal Worker secrets; GitHub does not need them. `--keep-vars` preserves existing Worker variables/secrets.
5. In that environment add variable `MANUAL_DEPLOYMENT_READY` = `reviewers-configured-auto-builds-disabled` only after checking steps 1–4. This is an owner setup attestation, not a substitute for GitHub's required-reviewer protection. Missing variable or credentials fails deployment closed. Limit repository administrators, require PR checks on main, and protect `.github/workflows/`, `scripts/` and Worker configuration changes through owner review.

Official references: [GitHub environment protection and plan availability](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments), [Cloudflare Builds and inactive version uploads](https://developers.cloudflare.com/workers/ci-cd/builds/).

## Exact release procedure

1. Ask ChatGPT to prepare changes in a branch and pull request in `babou500/dalasipay`, reusing the existing architecture and safeguards in `MANUAL_WAVE_PAYMENTS.md`. Review the diff. Never commit credentials. Changes to accounting/payroll, billing activation, entitlements or existing customer subscriptions need separate explicit authorization.
2. Check **Licensing safety checks** on the PR. It runs the Node security/regression suite and disposable PostgreSQL integration tests. Merge only when checks pass. Confirm Cloudflare automatic deployments are disabled before merging.
3. GitHub **Actions → Cloudflare manual release → Run workflow → main**. Leave `deploy` false and confirmation empty. This runs the same test workflow, installs integrity-locked Wrangler 4.149.0, prepares the existing public assets, and dry-runs all four configurations without credentials or uploading deployments. Inspect the green tests and dry-run logs.
4. Before deploying, run the read-only SQL below in the existing Supabase SQL Editor and retain the baseline privately with the approved commit SHA. No customer data or Supabase credential is sent to GitHub. Stop if the 13 Preview baseline differs, billing is enabled, or unexpected commercial records exist.
5. Dispatch **Cloudflare manual release** again on `main`, set `deploy` true and enter `DEPLOY VERIFIED COMMIT`. Tests and dry runs execute again for that exact run SHA. Open the run's pending `cloudflare-production` deployment, inspect the SHA/diff/checks, and click **Review deployments → Approve and deploy**. Do not bypass protection. Branch dispatches cannot deploy.
6. Deployment records active versions first, then deploys private authentication, administrator dashboard, customer portal and main application in order. All four are included; this is sequential and is NOT an atomic multi-Worker release. Keep changes backward compatible. A failure stops subsequent deployment; inspect partial state and use rollback below. No database migration is performed automatically.
7. The verification job checks private URL/previews disabled, the admin service binding, no secrets bound to main, anonymous admin Access redirect, private public URL 404, main/portal availability and exact deployed customer-script hash. Save the run URL, SHA, `release-snapshot.json` and `release-verify.json` contents from the run summary. GitHub retains logs/summaries according to repository retention; copy release evidence into the release record before expiry.
8. Sign in normally to the main app and check Settings → Subscription & Plans: correct business, unlimited Preview, approved prices, disabled Wave form and no transfer instructions. Sign into the administrator through Cloudflare Access, check business list, owner Settings and disabled Billing. Check that unauthenticated/unauthorized users remain blocked. Never copy JWTs/passwords into logs. Re-run the read-only SQL and compare the full subscription checksum. Record manual results; automated endpoint checks alone do not prove authenticated end-to-end operation.

## Read-only database checks

```sql
SELECT count(*) AS subscription_count,
       md5(string_agg(to_jsonb(s)::text, '' ORDER BY organization_id)) AS full_row_checksum
FROM public.workspace_subscriptions s;
-- Verified baseline: 13; 16d01b4bd7d59de8ae4df5dcec963e60
SELECT enabled, wave_phone IS NULL AS receiver_unconfigured
FROM public.subscription_billing_controls;
SELECT (SELECT count(*) FROM public.subscription_billing_invoices) AS invoices,
       (SELECT count(*) FROM public.subscription_billing_payments) AS payments,
       (SELECT count(*) FROM public.subscription_billing_receipts) AS receipts;
-- Development baseline: false / true; 0 / 0 / 0.
-- Receiver configuration may legitimately change only via owner Settings and audit.
```

Inspect the actual subscription plan/limit rows privately too; checksum equality proves exact full-row preservation. Stop on any unexpected change. Never “repair” a mismatch by overwriting existing customer subscriptions.

## Rollback

Use the **before-deployment** version IDs from that run's snapshot, not the newest version. The snapshot can contain a gradual rollout with multiple percentages: if so, preserve that distribution and use Cloudflare's deployment controls instead of guessing a single rollback target. For an ordinary 100% single-version snapshot:

1. Stop further releases; inspect which Workers actually deployed. Record the failure and owner approval to roll back. Cloudflare **Worker → Deployments → selected previous version → Rollback** can be used directly without Codex. Alternatively use a trusted terminal and `wrangler login` or a securely supplied scoped token (never a literal token in command history).
2. Install the repository's locked CLI with `npm ci --prefix tools/cloudflare --ignore-scripts --no-audit --no-fund` using Node 22+. Run the relevant commands, replacing each placeholder with its exact snapshot ID:

```sh
node tools/cloudflare/node_modules/wrangler/bin/wrangler.js rollback MAIN_VERSION --config cloudflare-main/wrangler.toml
node tools/cloudflare/node_modules/wrangler/bin/wrangler.js rollback PORTAL_VERSION --config cloudflare-licensing-worker/wrangler.toml
node tools/cloudflare/node_modules/wrangler/bin/wrangler.js rollback ADMIN_VERSION --config cloudflare-admin-worker/wrangler.staging.toml
node tools/cloudflare/node_modules/wrangler/bin/wrangler.js rollback PRIVATE_VERSION --config cloudflare-admin-worker/wrangler.private.toml
```

Roll back only affected Workers; coordinate dependency compatibility. Wrangler asks for confirmation. Verify the chosen previous version includes the needed bindings/assets. Retest Access, private isolation, normal customer/admin pages and database invariants. A rollback to older source will intentionally fail the current checkout's customer-source hash comparison: check against the corresponding old commit instead. Revert the source through a tested PR to avoid redeploying the bad version later. Do NOT reverse database migrations or delete audit history automatically; schema changes require separate reviewed forward-fix plans.

## Current handover status

Wave-only disabled-mode release is deployed (PR #5). Fresh verification: 177 Node tests, 27 PostgreSQL tests, three release safety tests and four CLI dry runs; live customer script matches source, Access redirects anonymous users, private URLs/previews are off, service binding remains correct. All 13 subscription rows match the previous checksum; billing false; zero invoices/payments/receipts. Live commercial transfers, screenshot upload and independent Wave-history review remain deliberately unverified until explicit launch approval and a separately authorized customer account.

This Actions workflow is prepared but production execution is NOT commissioned: environment reviewers, scoped environment secrets and the automatic Cloudflare Builds shutdown require owner configuration. No credentials have been created/exposed and no new production deployment is needed for this handover. Run the first dry-run dispatch and then an explicitly approved release after setup. Existing auto-build access limitation must be resolved before claiming approval-only production deployment.

## Credential validation failure in release run 38059756187

The run used merge commit b0a1ed6 (PR #8). Licensing checks and credential-free
Wrangler dry runs passed. Snapshot stopped inside local credential validation,
before Cloudflare API access, version capture or any Worker upload. The old
combined error cannot establish whether the token, account ID, or both failed.
GitHub does not allow reading saved secret values; do not infer them from masking.

PR #8 removed whitespace before validation and shared those normalized values with
API calls and Wrangler. It rejected a token starting with the letters `Bearer`
even without a scheme, detected duplicate `cfut_` but not `cfat_`/legacy tokens,
and silently joined internal whitespace in account IDs. The fix distinguishes
missing/invalid fields and pasted schemes/duplicate tokens using static messages.
It retains wrapped-token support and trims only outside an account ID. No values,
fragments, lengths, hashes or API response bodies are included in these errors.
A local format pass does not prove that a token is active or authorized.

Before an owner-approved future release, review **Settings > Environments >
cloudflare-production > Environment secrets**:

- `CLOUDFLARE_API_TOKEN`: one API token secret for the existing account and Workers;
  no `Bearer`, quotes, shell command, token name/ID or concatenated tokens. Account
  and user API tokens are supported; a Global API Key is not a token.
- `CLOUDFLARE_ACCOUNT_ID`: the existing Workers account's exact 32 hexadecimal
  characters from Cloudflare, not a zone ID, URL, account name or token ID.

Only replace a value if it is wrong; this investigation cannot name one secret
as conclusively responsible. Do not paste credentials into issues or logs.
Token scope/expiry and wrong-but-well-formed account IDs require a later approved
read-only API check; an authorization failure alone cannot distinguish them.
Cloudflare format reference:
https://developers.cloudflare.com/fundamentals/api/get-started/token-formats/

Do not rerun the failed workflow or deploy without owner approval. After review
and any approved merge, use a fresh approved release for the new SHA. Preserve
protected-environment reviewers, manual confirmation, all four Workers,
`--keep-vars`, pre-deployment snapshot and manual rollback review. This fix has
no customer, subscription, Supabase, billing or accounting changes.
