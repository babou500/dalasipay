import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const configs = ['cloudflare-admin-worker/wrangler.private.toml', 'cloudflare-admin-worker/wrangler.staging.toml', 'cloudflare-licensing-worker/wrangler.toml', 'cloudflare-main/wrangler.toml'];
const names = ['dalasipay-admin-auth-private', 'dalasipay-admin-staging', 'dalasipay-licensing-staging', 'dalasipay'];
const mode = process.argv[2];
if (!['dry-run', 'snapshot', 'deploy', 'verify'].includes(mode)) throw Error('Choose dry-run, snapshot, deploy or verify');
function run(args) {
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (r.status !== 0) throw Error('Release command failed');
}
async function get(path) {
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) throw Error('Protected Cloudflare secrets required');
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}${path}`, { headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` }, signal: AbortSignal.timeout(30000) });
  const j = await r.json();
  if (!r.ok || !j.success) throw Error(`Cloudflare API check failed: ${r.status}`);
  return j.result;
}
if (['dry-run', 'deploy'].includes(mode)) {
  if (mode === 'deploy' && (process.env.GITHUB_REF !== 'refs/heads/main' || process.env.RELEASE_APPROVAL !== 'DEPLOY VERIFIED COMMIT')) throw Error('Explicit approved main release required');
  run(['cloudflare-main/prepare-assets.mjs']);
  for (const config of configs) run(['tools/cloudflare/node_modules/wrangler/bin/wrangler.js', 'deploy', '--config', config, '--keep-vars', ...(mode === 'dry-run' ? ['--dry-run'] : [])]);
}
if (mode === 'snapshot' || mode === 'verify') {
  const versions = {};
  for (const name of names) {
    const sub = await get(`/workers/scripts/${name}/subdomain`);
    const settings = await get(`/workers/scripts/${name}/settings`);
    if (name === names[0] && (sub.enabled || sub.previews_enabled)) throw Error('Private Worker has public URL enabled');
    if (name === names[1] && !settings.bindings?.some(b => b.name === 'ADMIN_MEMBERSHIP_SERVICE' && b.service === names[0])) throw Error('Private service binding missing');
    if (name === names[3] && settings.bindings?.some(b => b.type === 'secret_text')) throw Error('Unexpected main Worker secret');
    const d = await get(`/workers/scripts/${name}/deployments`);
    versions[name] = d.deployments?.[0]?.versions;
    if (!versions[name]?.length) throw Error('Active version unavailable');
  }
  const record = { commit: process.env.GITHUB_SHA ?? null, versions };
  writeFileSync(`release-${mode}.json`, JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record));
}
if (mode === 'verify') {
  const admin = await fetch('https://dalasipay-admin-staging.baboucarrnjie212.workers.dev/settings', { redirect: 'manual' });
  if (admin.status !== 302 || !admin.headers.get('location')?.startsWith('https://throbbing-salad-ace9.cloudflareaccess.com/')) throw Error('Administrator Access protection check failed');
  const privateResponse = await fetch('https://dalasipay-admin-auth-private.baboucarrnjie212.workers.dev/');
  if (privateResponse.status !== 404) throw Error('Private Worker public endpoint unexpectedly responds');
  const main = await fetch('https://dalasipay.bebusinesssolutionsgm.com/');
  if (!main.ok) throw Error('Main application unavailable');
  const portal = await fetch('https://dalasipay-licensing-staging.baboucarrnjie212.workers.dev/subscriptions');
  if (!portal.ok) throw Error('Customer portal unavailable');
  const response = await fetch(`https://dalasipay.bebusinesssolutionsgm.com/subscription-customer.js?release=${process.env.GITHUB_SHA ?? Date.now()}`);
  const hash = s => createHash('sha256').update(s).digest('hex');
  if (!response.ok || hash(await response.text()) !== hash(readFileSync('subscription-customer.js', 'utf8').replace(/\r\n/g, '\n'))) throw Error('Live customer asset differs from approved source');
  console.log('Public availability, Access redirect, private isolation and customer source checks passed. Authenticated UI/database checks remain manual.');
}
