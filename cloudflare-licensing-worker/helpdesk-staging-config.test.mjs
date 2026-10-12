import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const cfg=readFileSync('cloudflare-licensing-worker/wrangler.toml','utf8');
const main=readFileSync('cloudflare-main/wrangler.toml','utf8');
test('staging ticket API remains off and does not claim production custom domain',()=>{assert.match(cfg,/DALASIPAY_HELPDESK_TICKETS_ENABLED\s*=\s*"false"/);assert.doesNotMatch(cfg,/custom_domain\s*=\s*true/);assert.doesNotMatch(cfg,/routes\s*=/);assert.match(main,/dalasipay\.bebusinesssolutionsgm\.com/);});
