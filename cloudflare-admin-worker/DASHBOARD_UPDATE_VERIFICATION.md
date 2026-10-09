# Administrator dashboard update verification - 2026-10-09 UTC

Reviewed all eight main-branch dashboard commits from 02372b9 through e0b50bc.
Pulled the latest source and corrected two regressions in commit d34e726:

- The existing Content Security Policy used form-action none, preventing browser
  filter submission. It now permits only same-origin form submissions; default-src
  none, base-uri none, frame-ancestors none, and all authorization checks remain.
- The PostgreSQL integration assertion expected the old raw status label. It now
  checks the formatted status and Unlimited access, and its real database fixture
  joins organization names with the same service-role read permissions as live.

## Executed validation

69 Administrator Node tests, 10 PostgreSQL integration tests, and 87 licensing and
subscription tests passed: 166 passed, zero failed/skipped in the final runs.
GitHub CI also passed: https://github.com/babou500/dalasipay/actions/runs/37872806165 .
The initial PostgreSQL run had one outdated presentation assertion failure; it was
corrected and all 10 tests passed on rerun. Both Wrangler dry-runs passed.

The actual signed owner Access session was cryptographically verified locally,
then used as a cookie against the deployed staging URL. Live HTTP checks passed:

| Check | Actual result |
| --- | --- |
| Authorized subscription API | 200, 13 named real records, all Professional Preview |
| Real business-name mapping | 12 saved BE Business Solution names; one BE Business Solutions |
| Dashboard overview | 200, 13 names, 13 Unlimited access cells |
| Case-insensitive business-name search | 200, one matching plural-name business |
| Workspace ID search | 200, one matching workspace |
| Plan and subscription-status search | 200, 13 matching records each |
| Preview entitlement | 200, 13 records |
| Other entitlement | 200, zero records |
| Combined search/preview and search/other | 200, one and zero records respectively |
| No matches and escaped malicious search input | 200, zero records, escaped HTML |
| Invalid entitlement filter | 200, falls back to all 13 |
| Identity-match and administrator authorization | 200, true |
| Mutation POST to dashboard | 404 |
| Missing and tampered Access sessions | 302 to Access, no dashboard data |
| Unknown unappointed subject in restricted live RPC | false |
| anon/authenticated execution of restricted RPC | denied |
| Private public and preview URLs | disabled |
| Production binding | ADMIN_MEMBERSHIP_SERVICE -> dalasipay-admin-auth-private |

Search/filter results and totals are explicitly scoped to the current bounded page.
All 13 existing records fit on one page. Filter form uses GET to the same origin;
the served CSP permits that submission. Live response HTML was inspected; native
browser visual rendering and a second person's real session were not inspected.
Signed unmapped-user denial is additionally covered in regression tests.

The complete ordered subscription snapshot checksum is identical before and after:
8c713fa30d53aaec16e3a4056ae52cd4. No subscription, name, entitlement, billing rule,
database permission, policy, or administrator appointment was changed in this update.
Only Administrator source/tests/docs changed. Main accounting/payroll source and
deployment were untouched; all 87 existing licensing/subscription regressions pass.
Temporary raw Access tokens and newly created client token caches were removed.

## Deployment

Existing configurations were used with --keep-vars, private first then staging.
Both uploads/deployments succeeded; no new Worker was created.

| Worker | Current version | Previous version |
| --- | --- | --- |
| dalasipay-admin-auth-private | 979992d1-62cd-4170-aac7-9eb17def2b73 | 6f551963-6ede-49ca-b86b-77c419bfa2ce |
| dalasipay-admin-staging | fe9580f2-ab35-443f-8319-2ccc05644807 | cabf9e66-fbc9-4df7-85f7-e42101e95369 |

Dashboard: https://dalasipay-admin-staging.baboucarrnjie212.workers.dev/
Rollback staging before private to the recorded preceding versions if needed,
retain Access, and recheck private URL disablement. No customer-data rollback is needed.
