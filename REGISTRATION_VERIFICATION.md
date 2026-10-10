# Registration investigation and release acceptance

## Cause and production evidence (2026-10-10 UTC)

Supabase intentionally obscures account existence. A successful signup with a user
object and no session can represent a new signup, an unconfirmed account or a
masked existing account. It is not proof that a new account was created or that
an email arrived. The old UI incorrectly translated this to `Account created`.
PR #11 removed that claim but used a different message for explicit duplicate
errors, and left reset/resend delivery claims and raw sign-in errors intact.

Read-only GET `/auth/v1/settings` returned email signup enabled, signup not
disabled and `mailer_autoconfirm: false`: confirmation remains required.
No signup/reset/resend was called against production, no customer lookup was
performed, and no SMTP/auth security setting was changed.

The custom domain root (ordinary and cache-busting query), existing Workers.dev
root and Vercel root all returned the exact normalized SHA-256 of merged PR #11's
`index.html`: `8b1f308824f4aa9a87d351926079a811bb400bab11be9a3c018862f59c2a2a44`.
All included the PR #11 message and omitted `Account created for`. Cloudflare
returned `public, max-age=0, must-revalidate`, with MISS/HIT responses delivering
the same bytes. The custom domain redirects `/index.html` to `/` (307), so release
verification must request the canonical root when comparing the local HTML.

Therefore PR #11 is present on these public endpoints at investigation time.
The previously reported old message requires an older loaded page/source; an
already-open tab or a request before the new release reached that endpoint is
consistent with the evidence. We cannot reconstruct the affected browser's
historical document or prove which of those occurred. A merge or Vercel preview
alone does not establish a Cloudflare release. The GitHub run lookup for PR #11's
merge SHA returned no runs, so it provides no Cloudflare rollout attribution.
Do not diagnose the current public page as still missing PR #11.

There is no `sw.js` in tracked repository history and the live URL returns 404.
The obsolete registration call for that missing script is removed; this change
does not delete browser caches, local financial records or sessions. No evidence
established an active service-worker cache as the cause. A stale open document
still needs a normal reload; clearing site data is unnecessary and could remove
local data.

## Fix

- One neutral signup outcome for new, masked existing, unconfirmed and duplicate
  responses, without examining identities or querying users. Email/SMTP,
  rate-limit and network failures use the same conditional instructions and
  never claim account creation or email delivery. Input errors remain actionable.
- Sign-in failures do not disclose missing/unconfirmed account status or raw
  provider details. Confirmation and recovery use conditional inbox guidance.
- Resend confirmation is always available on production auth screens and opens
  a form to confirm/edit the current email before sending. Password reset and
  return-to-sign-in remain available. No emails are sent on navigation.
- A URL containing `auth=confirmed` no longer claims verified confirmation on
  its own. Supabase still enforces confirmation and session validity.
- HTML and the auth feedback helper explicitly revalidate via Cloudflare
  `_headers`; release verification compares root HTML, auth helper and customer
  JS against approved bytes. This closes the old check's blind spot: it only
  compared `subscription-customer.js`, which PR #11 did not change.

The neutral notices intentionally cannot distinguish SMTP failure from a masked
existing-account result. They tell users to check spam, request confirmation,
try later, sign in or reset their password. Delivery success is never inferred
from an API response. Server-level timing and HTTP behavior remain Supabase's;
this frontend does not promise to conceal information already exposed by Auth.

## Validation and controlled release

Run the auth tests, all existing licensing/security tests, isolated PostgreSQL
fixtures, release guards, syntax checks and all four locked Wrangler dry runs.
Mocks cover raw Supabase new/existing/unconfirmed/duplicate responses, session
bootstrap, provider failures, confirmation/recovery redirects and sign-in errors.
Live email delivery testing remains an owner-controlled acceptance step with a
non-customer test mailbox after approval; tests do not create live accounts.

After an approved merge and explicit production approval, release the approved
SHA using the existing manual workflow. Preserve the protected environment,
pre-deployment versions, `--keep-vars`, four Workers and manual rollback review.
Verify the canonical root/feedback/customer assets match the approved source,
then reload the affected tab. Test a fresh mailbox and owner-controlled existing
and unconfirmed test accounts; check sign-in, reset and confirmation behavior.
Do not clear site storage or change Supabase confirmation/RLS settings.

No SQL, migrations, customer/financial records, 13 Professional Preview
subscriptions, commercial gates or billing settings are changed by this fix.

References: [Supabase signup behavior](https://supabase.com/docs/reference/javascript/auth-signup),
[Auth client signup implementation/documentation](https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/src/GoTrueClient.ts),
[confirmation resend](https://supabase.com/docs/reference/javascript/auth-resend),
[password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).
The current changelog index was reviewed; no relevant breaking change to this
hosted signup flow was identified.

## Completed checks for this PR

- 190 unit/security tests passed, including eight auth regression tests.
- 12 release/credential/source checks passed; all inline HTML scripts compiled.
- 27 isolated PostgreSQL tests passed using local PGlite fixtures (no remote DB).
- All four Wrangler dry runs passed; the final main asset package was also checked.
- Workflow syntax commands and `git diff --check` passed.

Local unit/dry-run checks used bundled Node 24. PostgreSQL tests passed on local
Node 20 with sequential execution and one WASM compilation task after concurrent
Node 24 runs exhausted local memory. GitHub's unchanged Node 22 runtime must
still pass CI. No failed production release was rerun.
