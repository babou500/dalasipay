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

test('credential diagnostics independently identify both fields without values', () => {
  const accountId = 'a'.repeat(32);
  const token = 'z'.repeat(40);
  const cases = [
    [{}, ['CLOUDFLARE_API_TOKEN: missing', 'CLOUDFLARE_ACCOUNT_ID: missing']],
    [{ CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: 'invalid-account-marker' }, ['CLOUDFLARE_ACCOUNT_ID: invalid format']],
    [{ CLOUDFLARE_API_TOKEN: 'invalid-token-marker!', CLOUDFLARE_ACCOUNT_ID: accountId }, ['CLOUDFLARE_API_TOKEN: invalid format']],
    [{ CLOUDFLARE_API_TOKEN: 'Bearer ' + token, CLOUDFLARE_ACCOUNT_ID: 'invalid-account-marker' }, ['CLOUDFLARE_API_TOKEN: authorization scheme', 'CLOUDFLARE_ACCOUNT_ID: invalid format']],
  ];
  for (const [env, expected] of cases) {
    assert.throws(() => normalizeCloudflareCredentials(env), error => {
      for (const message of expected) assert.ok(error.message.includes(message));
      for (const value of Object.values(env)) assert.ok(!String(error.stack).includes(value));
      return true;
    });
  }
});

test('plain tokens beginning with Bearer are not authorization schemes', () => {
  const token = 'Bearer' + 'z'.repeat(34);
  assert.equal(normalizeCloudflareCredentials({ CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: 'A'.repeat(32) }).token, token);
});

test('reject duplicate user, account, mixed and legacy tokens and pasted API keys', () => {
  for (const token of [
    'cfut_' + 'z'.repeat(48) + '\ncfut_' + 'z'.repeat(48),
    'cfat_' + 'z'.repeat(48) + '\ncfat_' + 'z'.repeat(48),
    'cfut_' + 'z'.repeat(48) + '\ncfat_' + 'z'.repeat(48),
    'z'.repeat(40) + '\n' + 'y'.repeat(40),
    'cfk_' + 'z'.repeat(48),
    '"' + 'z'.repeat(40) + '"',
    'z'.repeat(20) + '\u0000' + 'z'.repeat(20),
  ]) assert.throws(() => normalizeCloudflareCredentials({ CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32) }), /CLOUDFLARE_API_TOKEN:/);
});

test('account IDs require exactly 32 hex characters and only outer whitespace is trimmed', () => {
  for (const accountId of ['a'.repeat(31), 'a'.repeat(33), 'g'.repeat(32), 'a'.repeat(16) + '\n' + 'a'.repeat(16), 'https://dash.cloudflare.com/' + 'a'.repeat(32)]) {
    assert.throws(() => normalizeCloudflareCredentials({ CLOUDFLARE_API_TOKEN: 'z'.repeat(40), CLOUDFLARE_ACCOUNT_ID: accountId }), /CLOUDFLARE_ACCOUNT_ID: invalid format/);
  }
});

test('malformed credentials stop snapshot before network and evidence creation', () => {
  const r = attempt('snapshot', { CLOUDFLARE_API_TOKEN: 'invalid-token-marker!', CLOUDFLARE_ACCOUNT_ID: 'invalid-account-marker' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /CLOUDFLARE_API_TOKEN: invalid format/);
  assert.match(r.stderr, /CLOUDFLARE_ACCOUNT_ID: invalid format/);
  assert.doesNotMatch(r.stderr + r.stdout, /invalid-token-marker|invalid-account-marker|fetch failed|Cloudflare API check failed/);
});

test('wrapped account and legacy API tokens remain supported', () => {
  for (const token of ['cfat_' + 'z'.repeat(48), 'z'.repeat(40)]) {
    const wrapped = token.slice(0, 23) + '\r\n\t' + token.slice(23);
    assert.deepEqual(normalizeCloudflareCredentials({ CLOUDFLARE_API_TOKEN: wrapped, CLOUDFLARE_ACCOUNT_ID: ' \t' + 'A'.repeat(32) + '\r\n' }), { token, accountId: 'A'.repeat(32) });
  }
});

// The registration HTML must be checked, not only the subscription asset.
import {verifyPublicSources} from '../scripts/cloudflare-source-check.mjs';
test('release verifies exact authentication HTML and assets without writing or accepting redirects',async()=>{
  const calls=[];
  await verifyPublicSources({baseUrl:'https://example.test/',revision:'approved',readSource:path=>'current\r\n'+path,fetchImpl:async(url,options)=>{calls.push([url,options]);return {ok:true,text:async()=>'current\n'+(url.pathname==='/'?'index.html':url.pathname.slice(1))};}});
  assert.deepEqual(calls.map(([url])=>url.pathname),['/','/registration-feedback.js','/subscription-customer.js','/expenses-purchases.js']);
  assert.ok(calls.every(([url,options])=>url.searchParams.get('release')==='approved'&&options.cache==='no-store'&&options.redirect==='error'));
  await assert.rejects(verifyPublicSources({baseUrl:'https://example.test/',readSource:()=> 'approved',fetchImpl:async()=>({ok:true,text:async()=>'stale Account created'})}),/approved commit: index.html/);
  await assert.rejects(verifyPublicSources({baseUrl:'https://example.test/',readSource:()=> 'approved',fetchImpl:async()=>({ok:false})}),/approved commit: index.html/);
});


test('release source verification retries temporary propagation but never accepts a persistent mismatch',async()=>{
  const calls=[],waits=[],seen=new Map();
  await verifyPublicSources({
    baseUrl:'https://example.test/',revision:'approved',maxAttempts:3,retryDelayMs:5,
    readSource:path=>'approved:'+path,
    wait:async ms=>{waits.push(ms);},
    fetchImpl:async url=>{
      calls.push(url.pathname);
      const n=(seen.get(url.pathname)||0)+1;seen.set(url.pathname,n);
      const path=url.pathname==='/'?'index.html':url.pathname.slice(1);
      return {ok:true,text:async()=>url.pathname==='/'&&n===1?'stale page':'approved:'+path};
    }
  });
  assert.equal(seen.get('/'),2);
  assert.deepEqual(waits,[5]);
  assert.equal(calls.filter(x=>x==='/registration-feedback.js').length,1);
  await assert.rejects(verifyPublicSources({
    baseUrl:'https://example.test/',maxAttempts:3,retryDelayMs:1,
    readSource:()=> 'approved',wait:async()=>{},
    fetchImpl:async()=>({ok:true,text:async()=> 'old'})
  }),/approved commit: index\.html after 3 attempt/);
  await assert.rejects(verifyPublicSources({
    baseUrl:'https://example.test/',maxAttempts:2,retryDelayMs:1,
    readSource:()=> 'approved',wait:async()=>{},
    fetchImpl:async()=>{throw Error('transient failure');}
  }),/approved commit: index\.html after 2 attempt/);
});
