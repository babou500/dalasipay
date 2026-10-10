import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeCloudflareCredentials } from '../scripts/cloudflare-credentials.mjs';

const script = new URL('../scripts/cloudflare-release.mjs', import.meta.url);
function attempt(mode, overrides = {}) {
  return spawnSync(process.execPath, [fileURLToPath(script), mode], {
    encoding: 'utf8', env: { ...process.env, CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_ACCOUNT_ID: '', GITHUB_REF: '', RELEASE_APPROVAL: '', ...overrides }
  });
}
test('deployment refuses absent approval and non-main branches before invoking Wrangler', () => {
  for (const env of [{}, { GITHUB_REF: 'refs/heads/main' }, { GITHUB_REF: 'refs/heads/feature', RELEASE_APPROVAL: 'DEPLOY VERIFIED COMMIT' }]) {
    const r = attempt('deploy', env);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Explicit approved main release required/);
    assert.doesNotMatch(r.stdout, /Prepared|wrangler/);
  }
});
test('verification and snapshots fail closed without protected credentials', () => {
  for (const mode of ['verify', 'snapshot']) {
    const r = attempt(mode);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Protected Cloudflare secrets required/);
  }
});
test('manual release has no automatic trigger and requires environment and explicit main approval', () => {
  const y = readFileSync(new URL('../.github/workflows/cloudflare-manual-release.yml', import.meta.url), 'utf8');
  assert.match(y, /workflow_dispatch:/);
  assert.doesNotMatch(y, /^\s+(push|pull_request|schedule|workflow_run):/m);
  assert.match(y, /default: false/);
  assert.match(y, /environment: cloudflare-production/);
  assert.match(y, /github.ref == 'refs\/heads\/main'/);
  assert.match(y, /needs: dry-run/);
  assert.match(y, /reviewers-configured-auto-builds-disabled/);
});

test('Cloudflare credentials normalize accidental line breaks before both API and Wrangler use', () => {
  const token = 'cfut_' + 'a'.repeat(48);
  const accountId = '40e35bbd6d3097406a7c8f6e5e9bd4c8';
  const credentials = normalizeCloudflareCredentials({
    CLOUDFLARE_API_TOKEN: '  ' + token.slice(0,25) + '\r\n ' + token.slice(25) + '\n',
    CLOUDFLARE_ACCOUNT_ID: ' ' + accountId + '\n',
  });
  assert.deepEqual(credentials, { token, accountId });
  const release = readFileSync(script, 'utf8');
  assert.match(release, /process\.env\.CLOUDFLARE_API_TOKEN = credentials\.token/);
  assert.match(release, /process\.env\.CLOUDFLARE_ACCOUNT_ID = credentials\.accountId/);
});
test('Cloudflare credentials fail closed without leaking malformed or duplicated token values', () => {
  const accountId = '40e35bbd6d3097406a7c8f6e5e9bd4c8';
  const good = 'cfut_' + 'a'.repeat(48);
  for (const token of ['', 'Bearer ' + good, good + '\n' + good, '$(unsafe)', 'short']) {
    assert.throws(
      () => normalizeCloudflareCredentials({ CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: accountId }),
      error => !String(error).includes(good) && /Cloudflare secrets|required|Malformed Cloudflare credentials/.test(error.message)
    );
  }
});
